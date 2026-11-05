/**
 * Sending WhatsApp messages behind one interface (PRD 10 and 12): the cadence never
 * talks to WhatsAPI directly, so the provider can change without touching it.
 * Implementations: ./whatsapi.ts (the real one) and ./sandbox.ts (records in a
 * table). ./index.ts picks one per instance.
 */

export type SendTextInput = {
  /** E.164, as Patient.phone. */
  to: string;
  text: string;
  /** Our id for the message (the dispatch), echoed back by the provider when it can. */
  trackId?: string;
};

export type InstanceConnection = "connected" | "connecting" | "disconnected";

export interface MessagingProvider {
  /** The provider's id of the message, the one delivery receipts refer to. */
  sendText(input: SendTextInput): Promise<{ providerMessageId: string }>;
  getConnection(): Promise<InstanceConnection>;
  /** Points the instance's webhook at our URL (messages, receipts and connection events). */
  configureWebhook(url: string): Promise<void>;
}

/**
 * - disconnected: the instance cannot send now (not paired, logged out, bad token);
 *   the message waits in the queue (D-09).
 * - transient: worth retrying (timeout, 5xx, rate limit).
 * - rejected: this message will not go (invalid number, number not allowed).
 */
export type MessagingErrorKind = "disconnected" | "transient" | "rejected";

export class MessagingError extends Error {
  override name = "MessagingError";
  constructor(
    readonly kind: MessagingErrorKind,
    message: string,
  ) {
    super(message);
  }
}
