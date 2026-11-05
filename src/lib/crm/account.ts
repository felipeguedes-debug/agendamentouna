import { createHash } from "node:crypto";
import { forPractice, prisma, type PracticeScopedClient } from "@/lib/db";
import { phoneVariants } from "@/lib/patients/phone";

/**
 * A FlwChat account may serve several practices (D-73), so it belongs to none and is
 * read here through the base client, with what each practice does kept behind its own
 * scoped client. A practice only ever learns how many others share its account.
 */

export type CrmAccountRow = NonNullable<Awaited<ReturnType<typeof crmAccountById>>>;

export function hashWebhookSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function crmAccountById(accountId: string) {
  // Base client: the account belongs to no practice.
  return prisma.crmAccount.findUnique({ where: { id: accountId } });
}

export function crmAccountBySecret(secret: string) {
  // Base client: the webhook finds the account before any practice is known.
  return prisma.crmAccount.findUnique({ where: { webhookSecretHash: hashWebhookSecret(secret) } });
}

/** The practice's account, or null when it is not connected. */
export async function crmAccountOf(db: PracticeScopedClient) {
  const connection = await db.crmConnection.findFirst({ select: { crmAccountId: true } });
  return connection ? crmAccountById(connection.crmAccountId) : null;
}

/** The practices on the account. Only for the webhook and the rules that act across them. */
export async function practicesOfAccount(accountId: string) {
  // Base client: this is the list that crosses practices.
  const connections = await prisma.crmConnection.findMany({ where: { crmAccountId: accountId }, select: { practiceId: true } });
  return connections.map((connection) => connection.practiceId);
}

/** FlwChat refused the token: the export waits for a new one, and the screens warn (D-68). */
export async function markCrmRevoked(accountId: string, message: string, now = new Date()) {
  // Base client: the status is the account's, for every practice on it.
  await prisma.crmAccount.updateMany({ where: { id: accountId, status: "ACTIVE" }, data: { status: "REVOKED", statusChangedAt: now, lastError: message } });
}

/**
 * The appointments of everyone who is this contact, in every practice on the account,
 * for the one status tag the contact has (D-73). Only status and time leave here.
 */
export async function appointmentsOfContact(practiceIds: readonly string[], contact: { id: string; phone: string | null }) {
  const phones = contact.phone ? phoneVariants(contact.phone) : [];
  const rows = await Promise.all(
    practiceIds.map((practiceId) =>
      forPractice(practiceId).appointment.findMany({
        where: { patient: { is: { anonymizedAt: null, OR: [{ crmContactId: contact.id }, ...(phones.length > 0 ? [{ phone: { in: phones } }] : [])] } } },
        select: { status: true, startsAt: true },
      }),
    ),
  );
  return rows.flat();
}
