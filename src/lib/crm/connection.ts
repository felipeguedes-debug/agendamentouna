import { randomBytes } from "node:crypto";
import { AgendaError } from "@/lib/agenda/errors";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { encryptSecret } from "@/lib/crypto/secrets";
import { forPractice, prisma } from "@/lib/db";
import { crmAccountById, hashWebhookSecret, practicesOfAccount } from "./account";
import { crmProviderFor, crmProviderForToken, crmWebhookAddress, type CrmSyncOptions } from "./index";
import { isCrmError, type CrmSync } from "./provider";
import { CLEAR_CRM_RETRY, requestCrmSync } from "./queue";
import { CRM_TAGS } from "./rules";

/**
 * The practice's FlwChat account (PRD 11, Configurações da conta; D-67, D-68, D-73). The
 * token is checked before being kept and only encrypted (encryptSecret); the screen
 * never gets it back. A token of a company that already has an account joins it: several
 * practices may share one, with one subscription, and the token, the webhook and the
 * status are the account's. The webhook URL carries a secret of its own, stored only as
 * a hash, since FlwChat's subscription has no signature.
 *
 * The account is written through the base client, since it belongs to no practice; a
 * valid token of the company is what lets a practice join or renew it.
 */

const MAX_TOKEN = 1000;
const WAITING_STATUSES = ["SCHEDULED", "CONFIRMED"] as const;

function assertManages({ access }: PracticeContext) {
  if (!can(access.role, "practice-settings:edit")) throw new AgendaError("not_allowed", "Only the manager handles the CRM connection");
}

function connectionError(error: unknown): never {
  if (isCrmError(error, "auth")) throw new AgendaError("crm_token_refused", "FlwChat refused the token");
  if (isCrmError(error)) throw new AgendaError("crm_unavailable", error.message);
  throw error;
}

/** A new secret and a subscription for it; nothing when there is no public address. */
async function subscribe(crm: CrmSync) {
  const secret = randomBytes(32).toString("base64url");
  const url = crmWebhookAddress(secret);
  if (!url) return null;
  const { subscriptionId, companyId } = await crm.subscribeWebhook(url);
  return { subscriptionId, companyId, webhookSecretHash: hashWebhookSecret(secret) };
}

/** Best effort: an old subscription left behind posts to a URL that no longer answers. */
async function unsubscribe(crm: CrmSync, subscriptionId: string | null) {
  if (!subscriptionId) return;
  try {
    await crm.unsubscribeWebhook(subscriptionId);
  } catch (error) {
    if (!isCrmError(error)) throw error;
    console.warn(`Could not remove the CRM webhook subscription: ${error.message}`);
  }
}

/** The account goes with its last practice, subscription included. */
async function releaseAccount(accountId: string, provider?: CrmSync) {
  if ((await practicesOfAccount(accountId)).length > 0) return;
  const account = await crmAccountById(accountId);
  if (!account) return;
  await unsubscribe(provider ?? crmProviderFor(account), account.subscriptionId);
  // Base client: the account belongs to no practice.
  await prisma.crmAccount.delete({ where: { id: accountId } });
}

/**
 * Connects the practice, for "Salvar token" and for `npm run flwchat:setup`. Its future
 * open appointments go to the CRM; a patient without an appointment goes when something
 * happens to the patient.
 */
export async function connectPractice(practiceId: string, token: string, input: { actorUserId: string | null; provider?: CrmSync; now?: Date }) {
  const db = forPractice(practiceId);
  const now = input.now ?? new Date();
  const crm = input.provider ?? crmProviderForToken(token);
  let companyId: string | null;
  let existing;
  let webhook: Awaited<ReturnType<typeof subscribe>> = null;
  try {
    // The first call with a token, so it also proves the token works.
    companyId = await crm.companyId();
    // Base client: the company's account may be another practice's too (D-73).
    existing = companyId ? await prisma.crmAccount.findUnique({ where: { companyId } }) : null;
    // An account that exists has its tags: the API's list is cached and it accepts duplicates (D-70).
    if (!existing) await crm.ensureTags(CRM_TAGS);
    if (!existing?.subscriptionId) {
      webhook = await subscribe(crm);
      companyId ??= webhook?.companyId ?? null;
    }
  } catch (error) {
    connectionError(error);
  }

  const fields = {
    companyId,
    tokenEncrypted: encryptSecret(token),
    status: "ACTIVE" as const,
    statusChangedAt: now,
    lastError: null,
    ...(webhook ? { subscriptionId: webhook.subscriptionId, webhookSecretHash: webhook.webhookSecretHash } : {}),
  };
  // Base client: the account belongs to no practice.
  const account = existing ? await prisma.crmAccount.update({ where: { id: existing.id }, data: fields }) : await prisma.crmAccount.create({ data: fields });

  const previous = await db.crmConnection.findFirst();
  const connectionId = await db.$transaction(async (tx) => {
    const data = { crmAccountId: account.id, connectedByUserId: input.actorUserId };
    const connection = previous ? await tx.crmConnection.update({ where: { id: previous.id }, data }) : await tx.crmConnection.create({ data: { practiceId, ...data } });
    await tx.appointment.updateMany({ where: { startsAt: { gt: now }, status: { in: [...WAITING_STATUSES] } }, data: { crmSyncRequestedAt: now, ...CLEAR_CRM_RETRY } });
    await tx.auditEvent.create({
      data: {
        practiceId,
        actorType: input.actorUserId ? "USER" : "SYSTEM",
        actorUserId: input.actorUserId,
        action: "crm.connected",
        entityType: "CrmConnection",
        entityId: connection.id,
        changedFields: ["crmAccountId"],
      },
    });
    return connection.id;
  });
  if (previous && previous.crmAccountId !== account.id) await releaseAccount(previous.crmAccountId);
  await requestCrmSync(practiceId, db);
  return connectionId;
}

export async function saveCrmToken(context: PracticeContext, rawToken: string, options: CrmSyncOptions = {}) {
  assertManages(context);
  const token = rawToken.trim();
  if (!token) throw new AgendaError("crm_token_required", "The token is required");
  if (token.length > MAX_TOKEN) throw new AgendaError("invalid_text", "Token too long");
  await connectPractice(context.access.practiceId, token, { actorUserId: context.user.id, provider: options.provider, now: options.now });
}

/** A new secret and a new subscription: for a public address that came later, or a URL that leaked. */
export async function registerCrmWebhook(context: PracticeContext, options: CrmSyncOptions = {}) {
  assertManages(context);
  const { access, db, user } = context;
  const connection = await db.crmConnection.findFirst();
  const account = connection ? await crmAccountById(connection.crmAccountId) : null;
  if (!connection || !account) throw new AgendaError("crm_not_connected", "No CRM connection");
  const crm = options.provider ?? crmProviderFor(account);
  let webhook: Awaited<ReturnType<typeof subscribe>> = null;
  try {
    webhook = await subscribe(crm);
  } catch (error) {
    connectionError(error);
  }
  if (!webhook) throw new AgendaError("crm_no_public_url", "No public address for the webhook");
  // Base client: the account belongs to no practice.
  await prisma.crmAccount.update({ where: { id: account.id }, data: { subscriptionId: webhook.subscriptionId, webhookSecretHash: webhook.webhookSecretHash, ...(webhook.companyId ? { companyId: webhook.companyId } : {}) } });
  await db.auditEvent.create({
    data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "crm.webhook_registered", entityType: "CrmConnection", entityId: connection.id, changedFields: ["subscriptionId"] },
  });
  await unsubscribe(crm, account.subscriptionId);
}

/**
 * The agenda goes on without the CRM. What waited to go is dropped; a new connection
 * sends the future appointments. An account other practices still use stays.
 */
export async function disconnectCrm(context: PracticeContext, options: CrmSyncOptions = {}) {
  assertManages(context);
  const { access, db, user } = context;
  const connection = await db.crmConnection.findFirst();
  if (!connection) return;
  await db.$transaction(async (tx) => {
    await tx.crmConnection.delete({ where: { id: connection.id } });
    const cleared = { crmSyncRequestedAt: null, ...CLEAR_CRM_RETRY };
    await tx.patient.updateMany({ where: { OR: [{ crmSyncRequestedAt: { not: null } }, { crmSyncError: { not: null } }] }, data: cleared });
    await tx.appointment.updateMany({ where: { OR: [{ crmSyncRequestedAt: { not: null } }, { crmSyncError: { not: null } }] }, data: cleared });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "crm.disconnected", entityType: "CrmConnection", entityId: connection.id, changedFields: ["crmAccountId"] },
    });
  });
  await releaseAccount(connection.crmAccountId, options.provider);
}
