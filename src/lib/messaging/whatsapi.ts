import { MessagingError, type InstanceConnection, type MessagingProvider, type SendTextInput } from "./provider";

/**
 * WhatsAPI client (PRD 6, "Canal"). WhatsAPI resells uazapi ("uazapiGO", docs at
 * docs.uazapi.com, OpenAPI 2.6.9): each instance has its own server URL and token,
 * sent in the `token` header.
 *
 * - POST /send/text {number, text, track_source, track_id} → the message, whose
 *   `messageid` is the id that delivery receipts (`messages_update`) carry.
 * - GET /instance/status → instance.status: connected, connecting, disconnected or hibernated.
 * - GET and POST /webhook: the instance's webhooks; ours is added or updated by
 *   action, never replacing another system's (the number may serve other tools).
 *
 * Outside production the client only sends to the numbers in `allowedNumbers`
 * (MESSAGING_ALLOWED_NUMBERS), so a test instance never writes to a seed patient.
 */

export const WEBHOOK_EVENTS = ["messages", "messages_update", "connection"] as const;
const TRACK_SOURCE = "agenda-consultorios";
const DISCONNECTED_CODES = new Set(["instance_not_paired", "instance_not_connected"]);
const DISCONNECTED_TEXT = /not (paired|connected)|disconnected|desconectad|logged out/i;

export type WhatsapiOptions = {
  apiUrl: string;
  token: string;
  /** E.164 numbers allowed outside production; undefined allows all (production). */
  allowedNumbers?: readonly string[];
  fetch?: typeof fetch;
  timeoutMs?: number;
};

type Json = Record<string, unknown>;

export class WhatsapiProvider implements MessagingProvider {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(private readonly options: WhatsapiOptions) {
    this.baseUrl = options.apiUrl.replace(/\/+$/, "");
    this.fetcher = options.fetch ?? fetch;
  }

  async sendText(input: SendTextInput) {
    if (this.options.allowedNumbers && !this.options.allowedNumbers.includes(input.to)) {
      throw new MessagingError("rejected", "Number not in MESSAGING_ALLOWED_NUMBERS outside production");
    }
    const body: Json = { number: input.to.replace(/^\+/, ""), text: input.text, linkPreview: false };
    if (input.trackId) Object.assign(body, { track_source: TRACK_SOURCE, track_id: input.trackId });
    const message = await this.request("POST", "/send/text", body);
    const id = message.messageid ?? message.id;
    if (typeof id !== "string" || !id) throw new MessagingError("transient", "WhatsAPI answered without a message id");
    return { providerMessageId: id };
  }

  async getConnection(): Promise<InstanceConnection> {
    const answer = await this.request("GET", "/instance/status");
    const status = (answer.instance as Json | undefined)?.status;
    if (status === "connected") return "connected";
    return status === "connecting" ? "connecting" : "disconnected";
  }

  /**
   * Adds our webhook, or updates the one already ours (same path, another host when
   * the public URL changes). The instance may serve other systems too, so a webhook
   * of someone else is never replaced.
   */
  async configureWebhook(url: string) {
    const listed = await this.request("GET", "/webhook");
    const webhooks = (Array.isArray(listed) ? listed : [listed]) as Json[];
    const ownPath = new URL(url).pathname;
    const ours = webhooks.find((webhook) => typeof webhook.url === "string" && URL.canParse(webhook.url) && new URL(webhook.url).pathname === ownPath);
    // Group messages are not patients; messages sent by the API come back and are
    // ignored by fromMe, while their receipts are needed, so wasSentByApi stays.
    const settings = { enabled: true, url, events: [...WEBHOOK_EVENTS], excludeMessages: ["isGroupYes"] };
    await this.request("POST", "/webhook", ours ? { action: "update", id: ours.id, ...settings } : { action: "add", ...settings });
  }

  private async request(method: "GET" | "POST", path: string, body?: Json): Promise<Json> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method,
        headers: { token: this.options.token, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
      });
    } catch (error) {
      throw new MessagingError("transient", `WhatsAPI unreachable: ${(error as Error).message}`);
    }
    const answer = (await response.json().catch(() => ({}))) as Json;
    if (response.ok) return answer;

    const code = typeof answer.code === "string" ? answer.code : "";
    const text = typeof answer.error === "string" ? answer.error : response.statusText;
    if (response.status === 401 || DISCONNECTED_CODES.has(code) || DISCONNECTED_TEXT.test(text)) {
      throw new MessagingError("disconnected", `WhatsAPI ${response.status}: ${text}`);
    }
    if (response.status === 429 || response.status >= 500) throw new MessagingError("transient", `WhatsAPI ${response.status}: ${text}`);
    throw new MessagingError("rejected", `WhatsAPI ${response.status}: ${text}`);
  }
}
