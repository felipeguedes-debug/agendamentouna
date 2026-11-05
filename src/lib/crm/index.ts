import { createHash } from "node:crypto";
import { decryptSecret } from "@/lib/crypto/secrets";
import { appBaseUrl, isProduction, requiresRealProviders } from "@/lib/env";
import { normalizePhone } from "@/lib/patients/phone";
import { FlwchatProvider } from "./flwchat";
import { CrmError, type CrmSync } from "./provider";
import { SANDBOX_TOKEN_PREFIX, SandboxCrmProvider } from "./sandbox";

export { CrmError, isCrmError, type CrmContact, type CrmErrorKind, type CrmSync } from "./provider";

/**
 * Picks the CRM of an account from CRM_PROVIDER (D-66): "flwchat" talks to FlwChat,
 * "sandbox" (the default outside production) to the SandboxCrm tables. Production
 * always talks to FlwChat, except the production build of the end-to-end flows, which
 * runs on the test database (D-46) and has nothing else to talk to. Outside production,
 * a Vercel preview included (D-95), the real client reaches only the contacts in CRM_ALLOWED_CONTACTS, so a test never
 * writes on a real patient's contact.
 */

const DEFAULT_API_URL = "https://api.wts.chat";

export type CrmSyncOptions = { now?: Date; provider?: CrmSync };

export function crmMode(): "flwchat" | "sandbox" {
  if (requiresRealProviders()) return "flwchat";
  return process.env.CRM_PROVIDER === "flwchat" ? "flwchat" : "sandbox";
}

/** Contacts the real client may reach outside production, in E.164; undefined allows all (production). */
export function allowedCrmContacts() {
  if (isProduction()) return undefined;
  return (process.env.CRM_ALLOWED_CONTACTS ?? "")
    .split(",")
    .map((contact) => normalizePhone(contact.trim()))
    .filter((contact): contact is string => Boolean(contact));
}

/** A token that does not decrypt (another key, a seed placeholder) is as good as refused. */
class UnusableToken implements CrmSync {
  private fail(): never {
    throw new CrmError("auth", "The FlwChat token does not decrypt");
  }

  async ensureTags() {
    this.fail();
  }

  async companyId(): Promise<never> {
    this.fail();
  }

  async subscribeWebhook(): Promise<never> {
    this.fail();
  }

  async unsubscribeWebhook() {
    this.fail();
  }

  async getContact(): Promise<never> {
    this.fail();
  }

  async findContactByPhone(): Promise<never> {
    this.fail();
  }

  async createContact(): Promise<never> {
    this.fail();
  }

  async updateContactPhone(): Promise<never> {
    this.fail();
  }

  async updateTags() {
    this.fail();
  }

  async addNote(): Promise<never> {
    this.fail();
  }

  async deleteNote() {
    this.fail();
  }
}

/** The fake account of a token: what follows "sandbox-", or a hash, so a real token is never stored in the clear. */
function sandboxKeyOf(token: string) {
  return token.startsWith(SANDBOX_TOKEN_PREFIX) ? token.slice(SANDBOX_TOKEN_PREFIX.length) : createHash("sha256").update(token).digest("hex").slice(0, 16);
}

/**
 * The provider for a token just typed. Outside production a sandbox token (it starts
 * with "sandbox-") stays in the sandbox even with the real client on, so a real test
 * does not mark the demo's fake accounts as revoked.
 */
export function crmProviderForToken(token: string): CrmSync {
  if (crmMode() === "sandbox" || (!isProduction() && token.startsWith(SANDBOX_TOKEN_PREFIX))) return new SandboxCrmProvider(sandboxKeyOf(token));
  return new FlwchatProvider({ apiUrl: process.env.FLWCHAT_API_URL || DEFAULT_API_URL, token, allowedContacts: allowedCrmContacts() });
}

export function crmProviderFor(account: { tokenEncrypted: string }): CrmSync {
  let token: string;
  try {
    token = decryptSecret(account.tokenEncrypted);
  } catch {
    return new UnusableToken();
  }
  return crmProviderForToken(token);
}

/**
 * Where FlwChat posts the tag event: public HTTPS (D-24), with the account's secret in
 * the path, since its subscription has no signature (D-67). The sandbox has no such
 * limit. Without an address there is no webhook, and the daily reconciliation still
 * finds the commands (D-69).
 */
export function crmWebhookAddress(secret: string) {
  const path = `/api/webhooks/synkronos/${secret}`;
  const base = process.env.PUBLIC_WEBHOOK_URL;
  if (base?.startsWith("https://")) return new URL(path, base).toString();
  return crmMode() === "sandbox" ? new URL(path, appBaseUrl()).toString() : null;
}
