import { isProduction } from "@/lib/env";
import type { EmailMessage, EmailSender } from "./sender";

/**
 * Gmail as the e-mail provider (D-90), by SMTP with an app password of the account.
 * nodemailer is loaded only here, only when something is sent. Outside production, a
 * Vercel preview included (D-95), it reaches only EMAIL_ALLOWED_RECIPIENTS, as the other real providers do, so a test never
 * writes to a real person.
 */

export type GmailSettings = { user: string; appPassword: string; fromName: string; allowedRecipients: string[] | null };

const TIMEOUT_MS = 15_000;

export type GmailTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
};

export type GmailTransport = {
  sendMail(mail: { from: { name: string; address: string }; to: string; subject: string; text: string }): Promise<unknown>;
};

async function connectToGmail(options: GmailTransportOptions): Promise<GmailTransport> {
  const { createTransport } = await import("nodemailer");
  return createTransport(options);
}

export function gmailSettings(env: NodeJS.ProcessEnv): GmailSettings {
  const user = env.GMAIL_USER?.trim();
  const appPassword = env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !appPassword) throw new Error("EMAIL_PROVIDER=gmail needs GMAIL_USER and GMAIL_APP_PASSWORD");
  const listed = env.EMAIL_ALLOWED_RECIPIENTS?.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  return {
    user,
    appPassword,
    fromName: env.EMAIL_FROM_NAME?.trim() || "Agenda",
    allowedRecipients: listed?.length ? listed : isProduction(env) ? null : [],
  };
}

export class GmailEmailSender implements EmailSender {
  constructor(
    private readonly settings: GmailSettings,
    private readonly connect: (options: GmailTransportOptions) => Promise<GmailTransport> = connectToGmail,
  ) {}

  async send(message: EmailMessage) {
    const { user, appPassword, fromName, allowedRecipients } = this.settings;
    if (allowedRecipients && !allowedRecipients.includes(message.to.trim().toLowerCase())) {
      throw new Error("Recipient is not in EMAIL_ALLOWED_RECIPIENTS");
    }
    const transport = await this.connect({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: appPassword },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    });
    await transport.sendMail({ from: { name: fromName, address: user }, to: message.to, subject: message.subject, text: message.text });
  }
}
