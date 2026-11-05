import { createHash } from "node:crypto";
import { encryptSecret } from "@/lib/crypto/secrets";
import { CrmError, type CrmErrorKind, type CrmSync } from "@/lib/crm/provider";
import { SandboxCrmProvider, sandboxCompanyId } from "@/lib/crm/sandbox";
import { forPractice, prisma } from "@/lib/db";

// SynkronosCRM test data (Block 7): a practice connected to a fake CRM, the SandboxCrm
// tables. The fake account's key is the practice's id, unless the test shares one
// between practices (D-73).

/** Connects the practice as a finished "Salvar token" would; the secret is what the webhook URL carries. */
export async function connectCrm(practiceId: string, options: { secret?: string; status?: "ACTIVE" | "REVOKED" } = {}) {
  const secret = options.secret ?? `crm-secret-${practiceId}`;
  const account = await prisma.crmAccount.create({
    data: {
      tokenEncrypted: encryptSecret(`sandbox-${practiceId}`),
      status: options.status ?? "ACTIVE",
      companyId: sandboxCompanyId(practiceId),
      subscriptionId: `sandbox-subscription-${practiceId}`,
      webhookSecretHash: createHash("sha256").update(secret).digest("hex"),
    },
  });
  await forPractice(practiceId).crmConnection.create({ data: { practiceId, crmAccountId: account.id } });
  return { secret, accountId: account.id };
}

/** The sandbox of an account, except for the calls listed, which fail with the given kind. */
export function failingCrm(accountKey: string, kind: CrmErrorKind, calls: readonly (keyof CrmSync)[]): CrmSync & { attempts: number } {
  const sandbox = new SandboxCrmProvider(accountKey);
  const failing = { attempts: 0 };
  return new Proxy(sandbox as unknown as CrmSync & { attempts: number }, {
    get(target, property, receiver) {
      if (property === "attempts") return failing.attempts;
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      if (!calls.includes(property as keyof CrmSync)) return value.bind(target);
      return async () => {
        failing.attempts += 1;
        throw new CrmError(kind, `${String(property)} refused by the test`);
      };
    },
  });
}

/** The appointment's CRM sync columns. */
export async function crmStateOf(practiceId: string, appointmentId: string) {
  return forPractice(practiceId).appointment.findFirstOrThrow({
    where: { id: appointmentId },
    select: { crmSyncRequestedAt: true, crmSyncRetryAt: true, crmSyncAttempts: true, crmSyncError: true, crmSyncedAt: true, crmSyncedStatus: true, crmNoteIds: true },
  });
}

/** The fake CRM's contact of a phone, with its notes, oldest first. */
export async function crmContactOf(accountKey: string, phone: string) {
  return prisma.sandboxCrmContact.findFirst({
    where: { accountKey, phone },
    include: { notes: { orderBy: { createdAt: "asc" } } },
  });
}

/** The practice's account, for what the services take by id. */
export async function crmAccountOf(practiceId: string) {
  const connection = await forPractice(practiceId).crmConnection.findFirstOrThrow();
  return prisma.crmAccount.findUniqueOrThrow({ where: { id: connection.crmAccountId } });
}
