/**
 * SynkronosCRM behind one interface (PRD 12): the agenda never talks to FlwChat
 * directly, so the provider can change without touching the rules. Implementations:
 * ./flwchat.ts (the real one) and ./sandbox.ts (records in tables). ./index.ts picks one
 * per account. The API's paths and fields are mapped in docs/flwchat.md.
 */

export type CrmContact = {
  id: string;
  name: string | null;
  /** E.164, as Patient.phone; null when the CRM has no usable number. */
  phone: string | null;
  tags: string[];
};

/** What a write needs of a contact: its id, and the phone the allowed list checks. */
export type CrmContactRef = { id: string; phone: string | null };

export type CrmTag = { name: string; color: string };

export interface CrmSync {
  /** Creates the tags that are missing. The first call with a token, so it also proves the token works. */
  ensureTags(tags: readonly CrmTag[]): Promise<void>;
  /** The company behind the token, when the API can tell without creating anything (D-73). */
  companyId(): Promise<string | null>;
  /** Asks the account to post the tag event to `url` (the only event the agenda reads, D-05). */
  subscribeWebhook(url: string): Promise<{ subscriptionId: string; companyId: string | null }>;
  unsubscribeWebhook(subscriptionId: string): Promise<void>;

  getContact(contactId: string): Promise<CrmContact | null>;
  /** Tries the number with and without the ninth digit: the WhatsApp registers either. */
  findContactByPhone(phone: string): Promise<CrmContact | null>;
  /** Creates the contact, or returns the one that has the number, unchanged. */
  createContact(input: { name: string; phone: string }): Promise<CrmContact>;
  /** Only the phone: the name of a contact that exists is the CRM's, and may be shared (D-73). */
  updateContactPhone(contactId: string, phone: string): Promise<CrmContact>;
  /** Tags belong to the contact, not to a conversation. The contact's other tags stay. */
  updateTags(contact: CrmContactRef, change: { add: readonly string[]; remove: readonly string[] }): Promise<void>;

  /**
   * An internal note in the contact's latest conversation with that number; null when
   * there is none. A null number means the latest conversation of all, only for what
   * says nothing about an appointment: a conversation may be another practice's (D-73).
   */
  addNote(contact: CrmContactRef, text: string, options: { channelNumber: string | null }): Promise<{ noteId: string } | null>;
  deleteNote(noteId: string): Promise<void>;
}

/**
 * - auth: the token was refused; the export waits for a new one.
 * - not_found: the contact or note is no longer there.
 * - rate_limited: over the account's limit (429); the run stops and the next one goes on.
 * - transient: worth retrying (timeout, 5xx).
 * - rejected: this request will not go (invalid data, contact not allowed).
 */
export type CrmErrorKind = "auth" | "not_found" | "rate_limited" | "transient" | "rejected";

export class CrmError extends Error {
  override name = "CrmError";
  constructor(
    readonly kind: CrmErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export function isCrmError(error: unknown, kind?: CrmErrorKind): error is CrmError {
  return error instanceof CrmError && (kind === undefined || error.kind === kind);
}
