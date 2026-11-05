import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { ConsoleEmailSender } from "@/lib/email/sender";
import { createUser, signIn, TEST_PASSWORD } from "../../../tests/helpers/auth";
import { auth, PASSWORD_RESET_SECONDS } from "./auth";

// "Esqueci minha senha" (D-88), through the same endpoints the screens use.

const send = vi.spyOn(ConsoleEmailSender.prototype, "send").mockResolvedValue();

afterAll(async () => {
  await prisma.$disconnect();
});

async function requestLink(email: string) {
  send.mockClear();
  const result = await auth.api.requestPasswordReset({ body: { email, redirectTo: "/nova-senha" } });
  await vi.waitFor(() => expect(send.mock.calls.length).toBeGreaterThanOrEqual(0));
  return result;
}

function tokenFromEmail() {
  const text = send.mock.calls[0][0].text;
  const match = text.match(/reset-password\/([^?\s]+)/);
  if (!match) throw new Error(`No link in: ${text}`);
  return match[1];
}

async function canSignIn(email: string, password: string) {
  try {
    await signIn(email, password);
    return true;
  } catch {
    return false;
  }
}

describe("password reset", () => {
  it("sends the link and lets the person choose a new password", async () => {
    const user = await createUser("reset");
    await requestLink(user.email);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].to).toBe(user.email);

    await auth.api.resetPassword({ body: { newPassword: "senha-nova-123", token: tokenFromEmail() } });
    expect(await canSignIn(user.email, "senha-nova-123")).toBe(true);
    expect(await canSignIn(user.email, TEST_PASSWORD)).toBe(false);
  });

  it("answers the same for an email without an account, and sends nothing", async () => {
    const known = await createUser("reset-known");
    const answerForKnown = await requestLink(known.email);
    const answerForUnknown = await requestLink("ninguem@exemplo.test");
    expect(answerForUnknown).toEqual(answerForKnown);
    expect(send).not.toHaveBeenCalled();
  });

  it("answers without waiting for the e-mail, so the time does not tell whether the account exists", async () => {
    const user = await createUser("reset-slow");
    send.mockClear();
    send.mockReturnValueOnce(new Promise(() => undefined));
    await auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: "/nova-senha" } });
    expect(send).toHaveBeenCalledOnce();
  });

  it("answers the same when the e-mail fails", async () => {
    const user = await createUser("reset-failing");
    send.mockClear();
    send.mockRejectedValueOnce(new Error("Gmail refused"));
    await expect(auth.api.requestPasswordReset({ body: { email: user.email, redirectTo: "/nova-senha" } })).resolves.toMatchObject({ status: true });
  });

  it("works once", async () => {
    const user = await createUser("reset-once");
    await requestLink(user.email);
    const token = tokenFromEmail();
    await auth.api.resetPassword({ body: { newPassword: "senha-nova-123", token } });
    await expect(auth.api.resetPassword({ body: { newPassword: "outra-senha-123", token } })).rejects.toThrow();
    expect(await canSignIn(user.email, "outra-senha-123")).toBe(false);
  });

  it("expires after an hour", async () => {
    const user = await createUser("reset-expired");
    await requestLink(user.email);
    expect(PASSWORD_RESET_SECONDS).toBe(3600);
    await prisma.verification.updateMany({ where: { identifier: { contains: tokenFromEmail() } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(auth.api.resetPassword({ body: { newPassword: "senha-nova-123", token: tokenFromEmail() } })).rejects.toThrow();
  });

  it("ends the person's other sessions", async () => {
    const user = await createUser("reset-sessions");
    await signIn(user.email);
    expect(await prisma.session.count({ where: { userId: user.id } })).toBeGreaterThan(0);
    await requestLink(user.email);
    await auth.api.resetPassword({ body: { newPassword: "senha-nova-123", token: tokenFromEmail() } });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("refuses a password below the minimum", async () => {
    const user = await createUser("reset-short");
    await requestLink(user.email);
    await expect(auth.api.resetPassword({ body: { newPassword: "curta", token: tokenFromEmail() } })).rejects.toThrow();
  });
});
