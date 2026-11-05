import { describe, expect, it, vi } from "vitest";
import { gmailSettings, GmailEmailSender, type GmailTransport } from "./gmail";
import { ConsoleEmailSender, getEmailSender } from "./sender";

// The e-mail provider (D-90): Gmail by SMTP with an app password. The real send needs the
// account's credentials and is checked by hand with `npm run email:teste`.

const ENV = { NODE_ENV: "production", EMAIL_PROVIDER: "gmail", GMAIL_USER: "agenda@exemplo.test", GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop" } as unknown as NodeJS.ProcessEnv;

function fakeTransport(sendMail: GmailTransport["sendMail"] = vi.fn().mockResolvedValue({})) {
  return { sendMail };
}

const MESSAGE = { to: "Pessoa@Exemplo.test", subject: "Assunto", text: "Texto" };

describe("gmailSettings", () => {
  it("reads the account and takes the spaces off the app password, as Google shows it", () => {
    expect(gmailSettings(ENV)).toEqual({ user: "agenda@exemplo.test", appPassword: "abcdefghijklmnop", fromName: "Agenda", allowedRecipients: null });
  });

  it("refuses to start without the account, and does not print the password", () => {
    expect(() => gmailSettings({ ...ENV, GMAIL_USER: "" })).toThrow(/GMAIL_USER/);
    expect(() => gmailSettings({ ...ENV, GMAIL_APP_PASSWORD: "" })).toThrow(/GMAIL_APP_PASSWORD/);
    expect(() => gmailSettings({ ...ENV, GMAIL_USER: "" })).not.toThrow(/abcd/);
  });

  it("reaches only the allowed recipients outside production, none when the list is empty", () => {
    const development = { ...ENV, NODE_ENV: "development" } as NodeJS.ProcessEnv;
    expect(gmailSettings(development).allowedRecipients).toEqual([]);
    expect(gmailSettings({ ...development, EMAIL_ALLOWED_RECIPIENTS: " A@exemplo.test, b@exemplo.test " }).allowedRecipients).toEqual(["a@exemplo.test", "b@exemplo.test"]);
  });
});

describe("GmailEmailSender", () => {
  it("sends in the account's name, by Gmail's SMTP", async () => {
    const transport = fakeTransport();
    const connect = vi.fn().mockResolvedValue(transport);
    await new GmailEmailSender(gmailSettings(ENV), connect).send(MESSAGE);
    expect(connect).toHaveBeenCalledWith(expect.objectContaining({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: "agenda@exemplo.test", pass: "abcdefghijklmnop" } }));
    expect(transport.sendMail).toHaveBeenCalledWith({ from: { name: "Agenda", address: "agenda@exemplo.test" }, to: MESSAGE.to, subject: "Assunto", text: "Texto" });
  });

  it("does not hang on a Gmail that does not answer", async () => {
    const connect = vi.fn().mockResolvedValue(fakeTransport());
    await new GmailEmailSender(gmailSettings(ENV), connect).send(MESSAGE);
    expect(connect.mock.calls[0][0]).toMatchObject({ connectionTimeout: expect.any(Number), greetingTimeout: expect.any(Number), socketTimeout: expect.any(Number) });
  });

  it("refuses a recipient out of the list without connecting, and without naming the person", async () => {
    const connect = vi.fn();
    const sender = new GmailEmailSender({ ...gmailSettings(ENV), allowedRecipients: ["outra@exemplo.test"] }, connect);
    const failure = await sender.send(MESSAGE).catch((error: Error) => error.message);
    expect(failure).toContain("EMAIL_ALLOWED_RECIPIENTS");
    expect(failure).not.toContain("exemplo");
    expect(connect).not.toHaveBeenCalled();
  });

  it("compares the recipient ignoring case", async () => {
    const transport = fakeTransport();
    await new GmailEmailSender({ ...gmailSettings(ENV), allowedRecipients: ["pessoa@exemplo.test"] }, vi.fn().mockResolvedValue(transport)).send(MESSAGE);
    expect(transport.sendMail).toHaveBeenCalledOnce();
  });

  it("lets a failure of Gmail reach the caller, without the password", async () => {
    const transport = fakeTransport(vi.fn().mockRejectedValue(new Error("Invalid login")));
    const failure = await new GmailEmailSender(gmailSettings(ENV), vi.fn().mockResolvedValue(transport)).send(MESSAGE).catch((error: Error) => error.message);
    expect(failure).toContain("Invalid login");
    expect(failure).not.toContain("abcdefgh");
  });
});

describe("getEmailSender", () => {
  it("uses Gmail when asked, in any environment", () => {
    expect(getEmailSender(ENV)).toBeInstanceOf(GmailEmailSender);
    expect(getEmailSender({ ...ENV, NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBeInstanceOf(GmailEmailSender);
  });

  it("prints on the terminal in development, and in a test run of the production build that asks for it", () => {
    expect(getEmailSender({ NODE_ENV: "development" } as unknown as NodeJS.ProcessEnv)).toBeInstanceOf(ConsoleEmailSender);
    expect(getEmailSender({ NODE_ENV: "production", EMAIL_PROVIDER: "console" } as unknown as NodeJS.ProcessEnv)).toBeInstanceOf(ConsoleEmailSender);
  });

  it("refuses an unknown provider in any environment, instead of looking as if it sent", () => {
    for (const NODE_ENV of ["development", "production"]) {
      const env = { NODE_ENV, EMAIL_PROVIDER: "pessoa@exemplo.test" } as unknown as NodeJS.ProcessEnv;
      expect(() => getEmailSender(env)).toThrow(/EMAIL_PROVIDER/);
      expect(() => getEmailSender(env)).not.toThrow(/pessoa/);
    }
  });

  it("refuses in production with no provider chosen", () => {
    expect(() => getEmailSender({ NODE_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toThrow(/provider/);
  });
});
