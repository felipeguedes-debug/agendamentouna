import { AgendaError } from "@/lib/agenda/errors";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { isUuid } from "@/lib/db";
import type { EmailSender } from "@/lib/email/sender";
import { allowedNumbers, hasPublicWebhookUrl, MessagingError, messagingMode, whatsappWebhookAddress, type InstanceConnection, type MessagingProvider } from "@/lib/messaging";
import { WhatsapiProvider } from "@/lib/messaging/whatsapi";
import { normalizePhone } from "@/lib/patients/phone";
import { setInstanceConnection } from "./instances";

/**
 * The professional's WhatsApp on their screen (PRD 3 req. 9, D-94), for the manager and the
 * admin: the instance's URL and token, from WhatsAPI's panel, and its number. Pairing the
 * phone by QR Code stays on that panel. The token is saved only encrypted and never comes
 * back to the screen, and before saving it is tried against WhatsAPI, so a typo shows here
 * and not as a cadence that silently does not go out.
 */

type Deps = { fetch?: typeof fetch; emailSender?: EmailSender };

export type InstanceInput = { apiUrl: string; token: string; phone: string };

function assertAllowed(context: PracticeContext) {
  if (!can(context.access.role, "practice-settings:edit")) throw new AgendaError("not_allowed", "Cannot change the professional's WhatsApp");
}

const INTERNAL_HOST = /(^localhost$)|(\.(localhost|local|internal)$)/i;
const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;

/**
 * The server calls this address with the token, on behalf of whoever typed it. So only a
 * public HTTPS name passes, which keeps the server's own network out of reach (a name that
 * resolves to a private address is out of this check's scope).
 */
export function parseInstanceUrl(value: string) {
  const invalid = () => new AgendaError("instance_url_invalid", "The instance URL is not a public HTTPS address");
  const trimmed = value.trim();
  if (!URL.canParse(trimmed)) throw invalid();
  const url = new URL(trimmed);
  const isName = url.hostname.includes(".") && !url.hostname.startsWith("[") && !IPV4.test(url.hostname);
  if (url.protocol !== "https:" || url.username || url.password || !isName || INTERNAL_HOST.test(url.hostname)) throw invalid();
  return url.origin;
}

function savedToken(row: { tokenEncrypted: string } | null) {
  if (!row) return null;
  try {
    return decryptSecret(row.tokenEncrypted);
  } catch {
    // Another key, or a seed placeholder: as good as no token, so a new one is needed.
    return null;
  }
}

async function readConnection(client: MessagingProvider): Promise<InstanceConnection> {
  try {
    return await client.getConnection();
  } catch (error) {
    if (!(error instanceof MessagingError)) throw error;
    throw error.kind === "disconnected" ? new AgendaError("instance_token_refused", "WhatsAPI refused the token") : new AgendaError("instance_unreachable", "WhatsAPI did not answer");
  }
}

export async function saveWhatsappInstance(context: PracticeContext, professionalId: string, input: InstanceInput, deps: Deps = {}, now = new Date()) {
  assertAllowed(context);
  const { db, access, user } = context;
  const professional = isUuid(professionalId) ? await db.professional.findFirst({ where: { id: professionalId }, select: { id: true } }) : null;
  if (!professional) throw new AgendaError("professional_unavailable", "Professional not found in this practice");

  const apiUrl = parseInstanceUrl(input.apiUrl);
  const phoneNumber = normalizePhone(input.phone);
  if (!phoneNumber) throw new AgendaError("instance_phone_invalid", "The instance number is not valid");
  const current = await db.whatsappInstance.findFirst({ where: { professionalId: professional.id } });
  const typedToken = input.token.trim();
  const stored = savedToken(current);
  const token = typedToken || stored;
  if (!token) throw new AgendaError("instance_token_required", "A new instance needs its token");

  const real = messagingMode() === "whatsapi";
  // The patient's answers come only by this webhook (D-05): without it the cadence would ask and never hear back.
  if (real && !hasPublicWebhookUrl()) throw new AgendaError("public_url_missing", "PUBLIC_WEBHOOK_URL is not a public HTTPS address");
  const client = real ? new WhatsapiProvider({ apiUrl, token, allowedNumbers: allowedNumbers(), fetch: deps.fetch }) : null;
  const connection = client ? await readConnection(client) : null;

  const changedFields = current
    ? [...(current.apiUrl !== apiUrl ? ["apiUrl"] : []), ...(current.phoneNumber !== phoneNumber ? ["phoneNumber"] : []), ...(typedToken && typedToken !== stored ? ["token"] : [])]
    : ["apiUrl", "phoneNumber", "token"];
  const data = { providerInstanceId: apiUrl, apiUrl, phoneNumber, ...(typedToken && typedToken !== stored ? { tokenEncrypted: encryptSecret(typedToken) } : {}) };

  const instance = await db.$transaction(async (tx) => {
    const row = current
      ? await tx.whatsappInstance.update({ where: { id: current.id }, data })
      : await tx.whatsappInstance.create({ data: { practiceId: access.practiceId, professionalId: professional.id, ...data, tokenEncrypted: encryptSecret(token) } });
    // Dispatches planned while the professional had no instance now have one.
    await tx.dispatch.updateMany({ where: { whatsappInstanceId: null, status: "SCHEDULED", appointment: { professionalId: professional.id } }, data: { whatsappInstanceId: row.id } });
    if (changedFields.length > 0) {
      await tx.auditEvent.create({
        data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: current ? "whatsapp_instance.updated" : "whatsapp_instance.registered", entityType: "WhatsappInstance", entityId: row.id, changedFields },
      });
    }
    return row;
  });

  if (connection) await setInstanceConnection(access.practiceId, instance.id, connection, now, { emailSender: deps.emailSender });
  // What was saved stays when only this fails: saving again, with the token blank, tries again.
  let webhook: "configured" | "failed" = "configured";
  if (client) {
    try {
      await client.configureWebhook(whatsappWebhookAddress(instance.id)!);
    } catch (error) {
      if (!(error instanceof MessagingError)) throw error;
      console.warn(`Could not point the webhook of instance ${instance.id}: ${error.kind}`);
      webhook = "failed";
    }
  }
  return { id: instance.id, webhook };
}

/** What the screen shows. Never the token, not even whether it decrypts. */
export async function getWhatsappInstanceSetup(context: PracticeContext, professionalId: string) {
  assertAllowed(context);
  if (!isUuid(professionalId)) return null;
  return context.db.whatsappInstance.findFirst({ where: { professionalId }, select: { apiUrl: true, phoneNumber: true, status: true, statusChangedAt: true } });
}
