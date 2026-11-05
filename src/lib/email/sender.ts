import { isProduction } from "@/lib/env";
import { gmailSettings, GmailEmailSender } from "./gmail";

/**
 * Outgoing email (D-38, D-90): EMAIL_PROVIDER="gmail" sends through Gmail. Without it,
 * development and a Vercel preview (D-95) print each message on the server terminal and
 * production refuses to send;
 * tests use MemoryEmailSender. "console" lets a test run of the production build print
 * too, instead of writing to anyone.
 */

export type EmailMessage = { to: string; subject: string; text: string };

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export class ConsoleEmailSender implements EmailSender {
  async send(message: EmailMessage) {
    console.info(`\n[e-mail] Para: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n`);
  }
}

export function getEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  const provider = env.EMAIL_PROVIDER;
  if (provider === "gmail") return new GmailEmailSender(gmailSettings(env));
  if (provider === "console") return new ConsoleEmailSender();
  // A typo must not look like a send that only reached the terminal.
  if (provider) throw new Error("Unknown EMAIL_PROVIDER: use gmail or console (D-90)");
  if (!isProduction(env)) return new ConsoleEmailSender();
  throw new Error("No email provider is configured: set EMAIL_PROVIDER (D-90)");
}
