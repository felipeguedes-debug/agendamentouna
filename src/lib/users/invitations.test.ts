import { createHash } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getPracticeAccess, practiceContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { MemoryEmailSender } from "@/lib/email/memory";
import { TERMS_VERSION } from "@/lib/legal/terms";
import {
  addMember,
  addOrganizationAdmin,
  createPractice,
  createUser,
  signIn,
  uniqueEmail,
} from "../../../tests/helpers/auth";
import { UsersError } from "./errors";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
  createInvitation,
  getInvitation,
  revokeInvitation,
} from "./invitations";

// Invitations (PRD 3, requirement 3; D-38).

type User = Awaited<ReturnType<typeof createUser>>;

let organizationId: string;
let practiceId: string;
let otherPracticeId: string;
let admin: User;
let manager: User;
let secretary: User;
let email: MemoryEmailSender;

beforeAll(async () => {
  ({ organizationId, practiceId } = await createPractice("Consultório Convites"));
  otherPracticeId = (await createPractice("Outra conta")).practiceId;
  admin = await createUser("inv-admin");
  await addOrganizationAdmin(admin.id, organizationId);
  manager = await createUser("inv-manager");
  await addMember(manager.id, practiceId, "PRACTICE_MANAGER");
  secretary = await createUser("inv-secretary");
  await addMember(secretary.id, practiceId, "SECRETARY");
});

beforeEach(() => {
  email = new MemoryEmailSender();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function contextOf(user: User, id = practiceId) {
  const access = await getPracticeAccess(user.id, id);
  if (!access) throw new Error(`${user.email} has no access to ${id}`);
  return practiceContext(user, access);
}

async function invite(
  by: User,
  input: { email?: string; role?: "SECRETARY" | "PRACTICE_MANAGER" | "PROFESSIONAL"; professionalId?: string } = {},
) {
  const invited = input.email ?? uniqueEmail("invited");
  const result = await createInvitation(
    await contextOf(by),
    { email: invited, role: input.role ?? "SECRETARY", professionalId: input.professionalId },
    { emailSender: email },
  );
  const message = email.sent.at(-1)!;
  const token = message.text.match(/\/convite\/([A-Za-z0-9_-]+)/)![1];
  return { ...result, email: invited, token, message };
}

describe("createInvitation", () => {
  it("stores only the hash of the token and emails the link", async () => {
    const { invitationId, token, message, email: invited } = await invite(manager);

    expect(message.to).toBe(invited);
    expect(message.text).toContain(`http://localhost:3000/convite/${token}`);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    const row = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.expiresAt.getTime() - row.createdAt.getTime()).toBeCloseTo(7 * 86_400_000, -4);
    expect(row.invitedByUserId).toBe(manager.id);
    expect(
      await prisma.auditEvent.count({ where: { practiceId, action: "invitation.created", entityId: invitationId } }),
    ).toBe(1);
  });

  it("normalizes the email", async () => {
    const invited = uniqueEmail("Mixed.Case");
    const { invitationId } = await invite(manager, { email: `  ${invited.toUpperCase()} ` });
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })).email).toBe(invited.toLowerCase());
  });

  it("lets the manager invite secretaries only", async () => {
    await expect(invite(manager, { role: "PRACTICE_MANAGER" })).rejects.toMatchObject({ code: "role_not_allowed" });
    await expect(invite(secretary)).rejects.toMatchObject({ code: "role_not_allowed" });
    await expect(invite(admin, { role: "PRACTICE_MANAGER" })).resolves.toBeDefined();
  });

  it("ties a professional invitation to a professional record without a user", async () => {
    await expect(invite(admin, { role: "PROFESSIONAL" })).rejects.toMatchObject({ code: "professional_required" });

    const elsewhere = await prisma.professional.create({ data: { practiceId: otherPracticeId, name: "Dr. Fora" } });
    await expect(invite(admin, { role: "PROFESSIONAL", professionalId: elsewhere.id })).rejects.toMatchObject({
      code: "professional_unavailable",
    });

    const taken = await prisma.professional.create({ data: { practiceId, name: "Dra. Ocupada", userId: secretary.id } });
    await expect(invite(admin, { role: "PROFESSIONAL", professionalId: taken.id })).rejects.toMatchObject({
      code: "professional_unavailable",
    });
  });

  it("refuses someone who already has active access to the practice", async () => {
    await expect(invite(manager, { email: secretary.email })).rejects.toMatchObject({ code: "already_member" });
  });

  it("replaces the pending invitation for the same email", async () => {
    const invited = uniqueEmail("twice");
    const first = await invite(manager, { email: invited });
    await invite(manager, { email: invited });

    expect(await getInvitation(first.token)).toMatchObject({ status: "revoked" });
  });

  it("rejects an invalid email", async () => {
    await expect(invite(manager, { email: "sem-arroba" })).rejects.toBeInstanceOf(UsersError);
  });
});

describe("getInvitation", () => {
  it("shows the practice, role and status of a token", async () => {
    const { token, email: invited } = await invite(manager);
    expect(await getInvitation(token)).toMatchObject({
      practiceName: "Consultório Convites",
      role: "SECRETARY",
      email: invited,
      status: "pending",
      hasAccount: false,
    });
  });

  it("returns null for an unknown token", async () => {
    expect(await getInvitation("token-que-nao-existe")).toBeNull();
  });
});

describe("acceptInvitationAsNewUser", () => {
  const form = { name: "Nova Secretária", password: "senha-nova-123", acceptTerms: true };

  it("requires the terms, a name and a password of at least 8 characters", async () => {
    const { token } = await invite(manager);
    await expect(acceptInvitationAsNewUser(token, { ...form, acceptTerms: false })).rejects.toMatchObject({
      code: "terms_required",
    });
    await expect(acceptInvitationAsNewUser(token, { ...form, name: "  " })).rejects.toMatchObject({
      code: "name_required",
    });
    await expect(acceptInvitationAsNewUser(token, { ...form, password: "curta" })).rejects.toMatchObject({
      code: "weak_password",
    });
    expect(await getInvitation(token)).toMatchObject({ status: "pending" });
  });

  it("creates the user, the password login and the membership, once", async () => {
    const { token, invitationId, email: invited } = await invite(manager);
    const { userId, practiceId: joined } = await acceptInvitationAsNewUser(token, form);

    expect(joined).toBe(practiceId);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ email: invited, name: form.name, emailVerified: true, termsVersion: TERMS_VERSION });
    expect(user.termsAcceptedAt).toBeInstanceOf(Date);
    expect(await getPracticeAccess(userId, practiceId)).toMatchObject({ role: "SECRETARY" });
    await expect(signIn(invited, form.password)).resolves.toContain("session_token");
    expect(await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })).toMatchObject({
      acceptedUserId: userId,
    });
    expect(
      await prisma.auditEvent.count({ where: { practiceId, action: "invitation.accepted", entityId: invitationId } }),
    ).toBe(1);

    await expect(acceptInvitationAsNewUser(token, form)).rejects.toMatchObject({ code: "used" });
  });

  it("links the invited professional to the new user", async () => {
    const professional = await prisma.professional.create({ data: { practiceId, name: "Dra. Convidada" } });
    const { token } = await invite(admin, { role: "PROFESSIONAL", professionalId: professional.id });
    const { userId } = await acceptInvitationAsNewUser(token, form);

    expect((await prisma.professional.findUniqueOrThrow({ where: { id: professional.id } })).userId).toBe(userId);
    expect(await getPracticeAccess(userId, practiceId)).toMatchObject({ role: "PROFESSIONAL" });
  });

  it("refuses an expired or revoked invitation", async () => {
    const expired = await invite(manager);
    await prisma.invitation.update({ where: { id: expired.invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(acceptInvitationAsNewUser(expired.token, form)).rejects.toMatchObject({ code: "expired" });

    const revoked = await invite(manager);
    await revokeInvitation(await contextOf(manager), revoked.invitationId);
    await expect(acceptInvitationAsNewUser(revoked.token, form)).rejects.toMatchObject({ code: "revoked" });
  });

  it("sends an email that already has a login to the existing-user path", async () => {
    const existing = await createUser("has-login");
    const { token } = await invite(manager, { email: existing.email });

    expect(await getInvitation(token)).toMatchObject({ hasAccount: true });
    await expect(acceptInvitationAsNewUser(token, form)).rejects.toMatchObject({ code: "account_exists" });
  });
});

describe("acceptInvitationAsExistingUser", () => {
  it("adds the practice to the signed-in user with the invited email", async () => {
    const existing = await createUser("second-practice");
    const { token } = await invite(manager, { email: existing.email });

    await acceptInvitationAsExistingUser(token, { id: existing.id, email: existing.email });
    expect(await getPracticeAccess(existing.id, practiceId)).toMatchObject({ role: "SECRETARY" });
  });

  it("reactivates a revoked membership with the new role", async () => {
    const returning = await createUser("returning");
    await addMember(returning.id, practiceId, "PRACTICE_MANAGER", { revoked: true });
    const { token } = await invite(manager, { email: returning.email });

    await acceptInvitationAsExistingUser(token, { id: returning.id, email: returning.email });
    expect(await getPracticeAccess(returning.id, practiceId)).toMatchObject({ role: "SECRETARY" });
  });

  it("refuses a user with another email", async () => {
    const someoneElse = await createUser("someone-else");
    const { token } = await invite(manager);

    await expect(
      acceptInvitationAsExistingUser(token, { id: someoneElse.id, email: someoneElse.email }),
    ).rejects.toMatchObject({ code: "email_mismatch" });
  });
});

describe("revokeInvitation", () => {
  it("is limited to roles the user can invite", async () => {
    const { invitationId } = await invite(admin, { role: "PRACTICE_MANAGER" });
    await expect(revokeInvitation(await contextOf(manager), invitationId)).rejects.toMatchObject({
      code: "role_not_allowed",
    });
    await revokeInvitation(await contextOf(admin), invitationId);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })).revokedAt).toBeInstanceOf(Date);
  });

  it("does not reach another practice's invitation", async () => {
    const outsider = await createUser("other-manager");
    await addMember(outsider.id, otherPracticeId, "PRACTICE_MANAGER");
    const { invitationId } = await invite(manager);

    await expect(revokeInvitation(await contextOf(outsider, otherPracticeId), invitationId)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
