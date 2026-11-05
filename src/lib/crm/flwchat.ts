import { normalizePhone, phoneDigits, phoneVariants } from "@/lib/patients/phone";
import { normalizeTag } from "./rules";
import { CrmError, type CrmContact, type CrmContactRef, type CrmErrorKind, type CrmSync, type CrmTag } from "./provider";

/**
 * The FlwChat API, on which SynkronosCRM runs (docs/flwchat.md). A permanent token per
 * account goes as a bearer, and each module has its own prefix. Outside production the
 * client refuses contacts out of CRM_ALLOWED_CONTACTS: before the request where it knows
 * the number, and after a read by id otherwise. A developer never writes on a real
 * patient's contact, nor reads one.
 */

const REQUEST_TIMEOUT_MS = 15_000;
const SESSION_PAGE_SIZE = 20;
const WEBHOOK_NAME = "Agenda de consultórios";

/** The only event the agenda reads: the patient's messages come by WhatsAPI (D-05). */
const WEBHOOK_EVENTS = ["CONTACT_TAG_UPDATE"];

type Json = Record<string, unknown>;

/**
 * The API answers a missing contact with HTTP 500, not 404, and a refused form the same
 * way, so the InternalException's key decides before the status (D-70).
 */
function kindOf(status: number, body: unknown): CrmErrorKind {
  const failure = typeof body === "object" && body !== null ? (body as Json) : {};
  if (failure.key === "ENTITY_NOT_FOUND" || (typeof failure.text === "string" && /n[aã]o encontrad/i.test(failure.text))) return "not_found";
  if (failure.key === "FORM_ERROR") return "rejected";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limited";
  return status >= 500 ? "transient" : "rejected";
}

function toContact(row: Json): CrmContact {
  const phone = (row.phoneNumber ?? row.phonenumber) as string | null | undefined;
  const tags = row.tagNames ?? row.tags;
  return {
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : null,
    phone: phone ? normalizePhone(phoneDigits(phone)) : null,
    tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [],
  };
}

/** The number as the API takes it, in the URL and in the body: digits, with the country code. */
const apiPhone = (phone: string) => phoneDigits(phone);

export class FlwchatProvider implements CrmSync {
  private readonly apiUrl: string;
  private readonly token: string;
  private readonly fetcher: typeof fetch;
  private readonly allowedContacts?: readonly string[];
  /** The account's channels, read once per provider: one export asks for many notes. */
  private channels?: Promise<Map<string, string>>;

  constructor(options: { apiUrl: string; token: string; fetch?: typeof fetch; allowedContacts?: readonly string[] }) {
    this.apiUrl = options.apiUrl.replace(/\/+$/, "");
    this.token = options.token;
    this.fetcher = options.fetch ?? fetch;
    this.allowedContacts = options.allowedContacts;
  }

  /** The message carries what failed and the status, never the token or a phone in the path. */
  private async request(label: string, method: string, path: string, options: { body?: unknown; query?: Record<string, string> } = {}): Promise<unknown> {
    const query = options.query ? `?${new URLSearchParams(options.query)}` : "";
    let response: Response;
    try {
      response = await this.fetcher(`${this.apiUrl}${path}${query}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json", ...(options.body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new CrmError("transient", `FlwChat did not answer (${label})`);
    }
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Not JSON: the status decides.
    }
    if (!response.ok) throw new CrmError(kindOf(response.status, body), `FlwChat answered ${response.status} (${label})`);
    return body;
  }

  private assertAllowed(phone: string | null) {
    if (!this.allowedContacts) return;
    const variants = phone ? phoneVariants(phone) : [];
    if (!variants.some((variant) => this.allowedContacts!.includes(variant))) throw new CrmError("rejected", "Contact not in CRM_ALLOWED_CONTACTS");
  }

  async ensureTags(tags: readonly CrmTag[]) {
    const existing = await this.request("ensureTags", "GET", "/core/v1/tag");
    const names = new Set((Array.isArray(existing) ? (existing as Json[]) : []).map((tag) => normalizeTag(String(tag.name ?? ""))));
    for (const tag of tags) {
      if (!names.has(normalizeTag(tag.name))) await this.request("ensureTags", "POST", "/core/v1/tag", { body: { name: tag.name, color: tag.color } });
    }
  }

  /** The API has no endpoint for the company: any contact or subscription tells it. */
  async companyId() {
    const contacts = (await this.request("companyId", "POST", "/core/v1/contact/filter", { body: { pageNumber: 1, pageSize: 1 } })) as { items?: Json[] } | null;
    const fromContact = contacts?.items?.[0]?.companyId;
    if (typeof fromContact === "string") return fromContact;
    const subscriptions = await this.request("companyId", "GET", "/core/v1/webhook/subscription");
    const fromSubscription = Array.isArray(subscriptions) ? (subscriptions[0] as Json | undefined)?.companyId : undefined;
    return typeof fromSubscription === "string" ? fromSubscription : null;
  }

  async subscribeWebhook(url: string) {
    const created = (await this.request("subscribeWebhook", "POST", "/core/v1/webhook/subscription", {
      body: { name: WEBHOOK_NAME, url, events: WEBHOOK_EVENTS, enabled: true },
    })) as Json;
    return { subscriptionId: String(created.id), companyId: typeof created.companyId === "string" ? created.companyId : null };
  }

  async unsubscribeWebhook(subscriptionId: string) {
    await this.ignoringMissing(() => this.request("unsubscribeWebhook", "DELETE", `/core/v1/webhook/subscription/${encodeURIComponent(subscriptionId)}`));
  }

  private async ignoringMissing(call: () => Promise<unknown>) {
    try {
      return await call();
    } catch (error) {
      if (error instanceof CrmError && error.kind === "not_found") return null;
      throw error;
    }
  }

  async getContact(contactId: string) {
    const row = await this.ignoringMissing(() => this.request("getContact", "GET", `/core/v1/contact/${encodeURIComponent(contactId)}`, { query: { IncludeDetails: "Tags" } }));
    if (!row || !(row as Json).id) return null;
    const contact = toContact(row as Json);
    this.assertAllowed(contact.phone);
    return contact;
  }

  async findContactByPhone(phone: string) {
    this.assertAllowed(phone);
    for (const variant of phoneVariants(phone)) {
      const row = await this.ignoringMissing(() => this.request("findContactByPhone", "GET", `/core/v1/contact/phonenumber/${apiPhone(variant)}`, { query: { IncludeDetails: "Tags" } }));
      if (row && (row as Json).id) return toContact(row as Json);
    }
    return null;
  }

  async createContact(input: { name: string; phone: string }) {
    this.assertAllowed(input.phone);
    const row = await this.request("createContact", "POST", "/core/v1/contact", { body: { name: input.name, phoneNumber: apiPhone(input.phone), options: { getIfExists: true } } });
    return toContact(row as Json);
  }

  async updateContactPhone(contactId: string, phone: string) {
    this.assertAllowed(phone);
    const row = await this.request("updateContactPhone", "PUT", `/core/v2/contact/${encodeURIComponent(contactId)}`, { body: { fields: ["PhoneNumber"], phoneNumber: apiPhone(phone) } });
    return toContact(row as Json);
  }

  async updateTags(contact: CrmContactRef, change: { add: readonly string[]; remove: readonly string[] }) {
    this.assertAllowed(contact.phone);
    const path = `/core/v1/contact/${encodeURIComponent(contact.id)}/tags`;
    if (change.remove.length > 0) await this.request("updateTags", "POST", path, { body: { tagNames: change.remove, operation: "DeleteIfExists" } });
    if (change.add.length > 0) await this.request("updateTags", "POST", path, { body: { tagNames: change.add, operation: "InsertIfNotExists" } });
  }

  /** Channels by E.164 number, every form of it: a channel's number comes as "+55|11999990000". */
  private channelsByNumber() {
    this.channels ??= this.request("addNote", "GET", "/chat/v1/channel").then((rows) => {
      const byNumber = new Map<string, string>();
      for (const channel of Array.isArray(rows) ? (rows as Json[]) : []) {
        const number = typeof channel.number === "string" ? normalizePhone(phoneDigits(channel.number)) : null;
        if (number) for (const variant of phoneVariants(number)) byNumber.set(variant, String(channel.id));
      }
      return byNumber;
    });
    return this.channels;
  }

  async addNote(contact: CrmContactRef, text: string, options: { channelNumber: string | null }) {
    this.assertAllowed(contact.phone);
    const query: Record<string, string> = { ContactId: contact.id, Type: "INDIVIDUAL", PageSize: String(SESSION_PAGE_SIZE), OrderBy: "CreatedAt", OrderDirection: "DESCENDING" };
    if (options.channelNumber) {
      const channelId = (await this.channelsByNumber()).get(options.channelNumber);
      if (!channelId) return null;
      query.ChannelsId = channelId;
    }
    const sessions = (await this.request("addNote", "GET", "/chat/v2/session", { query })) as { items?: Json[] } | null;
    const latest = (sessions?.items ?? [])
      .map((session) => ({ id: String(session.id), at: new Date(String(session.lastInteractionDate ?? session.createdAt ?? 0)).getTime() }))
      .sort((a, b) => b.at - a.at)[0];
    if (!latest) return null;
    const note = (await this.request("addNote", "POST", `/chat/v1/session/${encodeURIComponent(latest.id)}/note`, { body: { text } })) as Json;
    return { noteId: String(note.id) };
  }

  async deleteNote(noteId: string) {
    await this.ignoringMissing(() => this.request("deleteNote", "DELETE", `/chat/v1/session/note/${encodeURIComponent(noteId)}`));
  }
}
