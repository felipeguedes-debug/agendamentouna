import { decryptSecret } from "@/lib/crypto/secrets";
import { isProduction, requiresRealProviders } from "@/lib/env";
import { normalizePhone } from "@/lib/patients/phone";
import { MessagingError, type MessagingProvider } from "./provider";
import { SandboxMessagingProvider } from "./sandbox";
import { WhatsapiProvider } from "./whatsapi";

export { MessagingError, type InstanceConnection, type MessagingProvider, type SendTextInput } from "./provider";

/**
 * Picks the provider of an instance from MESSAGING_PROVIDER: "whatsapi" sends for
 * real, "sandbox" records in SandboxMessage. Production always sends for real, except the
 * production build of the end-to-end flows, on the test database (D-46). Outside production,
 * a Vercel preview included (D-95), the real client only reaches MESSAGING_ALLOWED_NUMBERS.
 */

type InstanceRow = { id: string; practiceId: string; apiUrl: string; tokenEncrypted: string };

export function messagingMode(): "whatsapi" | "sandbox" {
  if (requiresRealProviders()) return "whatsapi";
  return process.env.MESSAGING_PROVIDER === "whatsapi" ? "whatsapi" : "sandbox";
}

/** Numbers the real client may reach outside production, in E.164. */
export function allowedNumbers() {
  if (isProduction()) return undefined;
  return (process.env.MESSAGING_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map((number) => normalizePhone(number.trim()))
    .filter((number): number is string => Boolean(number));
}

/** An instance whose token does not decrypt (another key, a seed placeholder) cannot send. */
class UnusableInstance implements MessagingProvider {
  private fail(): never {
    throw new MessagingError("disconnected", "Instance token does not decrypt");
  }

  async sendText() {
    return this.fail();
  }

  async getConnection() {
    return "disconnected" as const;
  }

  async configureWebhook() {
    this.fail();
  }
}

function publicWebhookBase() {
  const base = process.env.PUBLIC_WEBHOOK_URL?.trim();
  return base?.startsWith("https://") ? base : null;
}

export function hasPublicWebhookUrl() {
  return publicWebhookBase() !== null;
}

/** Where WhatsAPI posts this instance's events: public HTTPS (D-24), or nothing. */
export function whatsappWebhookAddress(instanceId: string) {
  const base = publicWebhookBase();
  return base ? new URL(`/api/webhooks/whatsapi/${instanceId}`, base).toString() : null;
}

export function providerFor(instance: InstanceRow): MessagingProvider {
  if (messagingMode() === "sandbox") return new SandboxMessagingProvider(instance.practiceId, instance.id);
  let token: string;
  try {
    token = decryptSecret(instance.tokenEncrypted);
  } catch {
    return new UnusableInstance();
  }
  return new WhatsapiProvider({ apiUrl: instance.apiUrl, token, allowedNumbers: allowedNumbers() });
}
