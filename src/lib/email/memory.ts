import type { EmailMessage, EmailSender } from "./sender";

/** Keeps sent messages in memory, for tests. */
export class MemoryEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage) {
    this.sent.push(message);
  }
}
