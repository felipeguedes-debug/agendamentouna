import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { phoneVariants } from "@/lib/patients/phone";
import { crmAccountBySecret, markCrmRevoked, practicesOfAccount } from "./account";
import { allowedCrmContacts, crmMode, crmProviderFor, type CrmSyncOptions } from "./index";
import { applyContactCommands } from "./inbound";
import { isCrmError } from "./provider";
import { requestContactCheck } from "./queue";
import { commandsIn, parseWebhookEvent } from "./rules";

/**
 * The SynkronosCRM webhook (D-05, D-66, D-67, D-73). FlwChat's subscription has no
 * signature, its events no id, and it covers the whole account: in a real account, the
 * tag changes of every contact, of every practice and of whoever else uses it, come here.
 * So:
 *
 * - the secret in the URL says which account this is, and an event of another FlwChat
 *   company is refused by its companyId;
 * - nothing in the body is believed: the agenda reads the contact again with the
 *   account's token (./inbound.ts), and the body only spares that call when it shows no
 *   command, which is almost always. No body is logged or stored;
 * - a repeated delivery is known by its type, date and contact, and, should it change
 *   date, finds the tag already gone;
 * - with the CRM down the event is still accepted, and Inngest tries the contact again.
 *   A command that is lost even so stays on the contact for the daily reconciliation.
 */

const COMMAND_EVENT = "CONTACT_TAG_UPDATE";

export type CrmWebhookAnswer = { status: 200 | 400 | 401; body: Record<string, unknown> };

const IGNORED: CrmWebhookAnswer = { status: 200, body: { ok: true, ignored: true } };
const UNAUTHORIZED: CrmWebhookAnswer = { status: 401, body: { error: "unauthorized" } };

function deliveryKeyOf(eventType: string, date: string | null, contactId: string) {
  return createHash("sha256").update(`${eventType}|${date ?? ""}|${contactId}`).digest("hex");
}

/** Outside production the real client knows only the allowed contacts: the others stop here, with no call. */
function isOutOfTheTest(phone: string | null) {
  if (crmMode() !== "flwchat") return false;
  const allowed = allowedCrmContacts();
  return allowed !== undefined && phone !== null && !phoneVariants(phone).some((variant) => allowed.includes(variant));
}

export async function handleCrmWebhook(secret: string, body: unknown, options: CrmSyncOptions = {}): Promise<CrmWebhookAnswer> {
  if (!secret) return UNAUTHORIZED;
  const account = await crmAccountBySecret(secret);
  if (!account) return UNAUTHORIZED;
  if (typeof body !== "object" || body === null || Array.isArray(body)) return { status: 400, body: { error: "invalid_body" } };

  const event = parseWebhookEvent(body);
  if (event?.companyId && account.companyId && event.companyId !== account.companyId) return UNAUTHORIZED;
  if (account.status !== "ACTIVE" || event?.eventType !== COMMAND_EVENT || !event.contactId) return IGNORED;
  if (event.tags && commandsIn(event.tags).length === 0) return IGNORED;
  if (isOutOfTheTest(event.phone)) return IGNORED;

  const deliveryKey = deliveryKeyOf(event.eventType, event.date, event.contactId);
  const practiceIds = await practicesOfAccount(account.id);
  // Base client: the delivery may have gone to any practice of the account.
  if ((await prisma.crmInboundEvent.count({ where: { practiceId: { in: practiceIds }, deliveryKey } })) > 0) return { status: 200, body: { ok: true, duplicate: true } };

  const provider = options.provider ?? crmProviderFor(account);
  try {
    const results = await applyContactCommands(account.id, { contactId: event.contactId, origin: "webhook", deliveryKey }, { ...options, provider });
    return { status: 200, body: { ok: true, commands: results.length } };
  } catch (error) {
    if (!isCrmError(error)) throw error;
    if (error.kind === "auth") {
      await markCrmRevoked(account.id, error.message, options.now);
      return IGNORED;
    }
    if (error.kind === "transient" || error.kind === "rate_limited") {
      await requestContactCheck(account.id, event.contactId);
      return { status: 200, body: { ok: true, queued: true } };
    }
    console.warn(`CRM webhook failed: ${error.message}`);
    return IGNORED;
  }
}
