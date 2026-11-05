import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getPracticeAccess, listPracticeAccess } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { MemoryEmailSender } from "@/lib/email/memory";
import type { EmailSender } from "@/lib/email/sender";
import { acceptInvitationAsExistingUser, acceptInvitationAsNewUser, createInvitation, getInvitation } from "@/lib/users/invitations";
import { contextAs } from "../../../tests/helpers/practice";
import { createPractice, createUser, TEST_PASSWORD, uniqueEmail } from "../../../tests/helpers/auth";
import { addPracticeToOrganization, createFirstAccount, OperatorError, reissueAdminInvitation } from "./first-account";

// A database with nobody in it (D-93): only this command creates an organization, its
// first practice and the invitation of its first admin, and the admin takes it from there.

const BASE_URL = "https://agenda.exemplo.test";
let emails: MemoryEmailSender;

beforeEach(() => {
  emails = new MemoryEmailSender();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function input(overrides: Partial<Parameters<typeof createFirstAccount>[0]> = {}) {
  const tag = randomUUID().slice(0, 8);
  return { organization: `Organização ${tag}`, practice: `Consultório ${tag}`, location: "Unidade Aldeota", address: "Av. Teste, 100", timeZone: "America/Fortaleza", email: uniqueEmail("primeiro-admin"), ...overrides };
}

function tokenOf(email: { text: string }) {
  const match = email.text.match(/\/convite\/([\w-]+)/);
  if (!match) throw new Error("No invitation link in the email");
  return match[1];
}

async function create(overrides: Partial<Parameters<typeof createFirstAccount>[0]> = {}) {
  const created = await createFirstAccount(input(overrides), { emailSender: emails, baseUrl: BASE_URL });
  return { ...created, token: tokenOf(emails.sent.at(-1)!) };
}

describe("createFirstAccount", () => {
  it("creates the organization, the practice, its location and a pending invitation", async () => {
    const data = input();
    const created = await createFirstAccount(data, { emailSender: emails, baseUrl: BASE_URL });

    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: created.practiceId }, include: { organization: true, locations: true } });
    expect(practice.name).toBe(data.practice);
    expect(practice.organization.name).toBe(data.organization);
    expect(practice.locations).toEqual([expect.objectContaining({ name: data.location, address: data.address, timeZone: data.timeZone, active: true })]);

    const invitation = await prisma.invitation.findFirstOrThrow({ where: { practiceId: created.practiceId } });
    expect(invitation).toMatchObject({ email: data.email, role: "PRACTICE_MANAGER", organizationAdmin: true, invitedByUserId: null, acceptedAt: null, revokedAt: null });
    expect(created.delivered).toBe(true);
    expect(created.link).toBeNull();
  });

  it("sends the link by e-mail and keeps only the token's hash", async () => {
    const data = input();
    const { practiceId } = await createFirstAccount(data, { emailSender: emails, baseUrl: BASE_URL });
    expect(emails.sent).toHaveLength(1);
    expect(emails.sent[0].to).toBe(data.email);
    expect(emails.sent[0].text).toContain(`${BASE_URL}/convite/`);
    expect(emails.sent[0].text).toContain("Admin da organização");

    const token = tokenOf(emails.sent[0]);
    const invitation = await prisma.invitation.findFirstOrThrow({ where: { practiceId } });
    expect(invitation.tokenHash).not.toContain(token);
    expect(await getInvitation(token)).toMatchObject({ status: "pending", email: data.email, organizationAdmin: true });
  });

  it("records it on the audit trail as the system, with no personal value", async () => {
    const { practiceId } = await create();
    const events = await prisma.auditEvent.findMany({ where: { practiceId }, orderBy: { action: "asc" } });
    expect(events.map((event) => event.action)).toEqual(["invitation.created", "location.created", "practice.created"]);
    for (const event of events) {
      expect(event.actorType).toBe("SYSTEM");
      expect(event.actorUserId).toBeNull();
      expect(JSON.stringify(event.changedFields)).not.toContain("@");
    }
  });

  it("keeps the invitation and hands over the link when the e-mail does not leave", async () => {
    const failing: EmailSender = {
      send: async () => {
        throw new Error("Gmail said no");
      },
    };
    const data = input();
    const created = await createFirstAccount(data, { emailSender: failing, baseUrl: BASE_URL });
    expect(created.delivered).toBe(false);
    expect(created.link).toContain(`${BASE_URL}/convite/`);
    const token = created.link!.split("/convite/")[1];
    expect(await getInvitation(token)).toMatchObject({ status: "pending" });
  });

  it.each([
    ["an organization without a name", { organization: "  " }],
    ["a practice without a name", { practice: "" }],
    ["a location without a name", { location: "" }],
    ["a location without an address", { address: "" }],
    ["an invalid e-mail", { email: "não é e-mail" }],
    ["an unknown time zone", { timeZone: "Marte/Olympus" }],
  ])("refuses %s, with nothing written", async (_label, overrides) => {
    const data = input(overrides);
    await expect(createFirstAccount(data, { emailSender: emails, baseUrl: BASE_URL })).rejects.toBeInstanceOf(OperatorError);
    expect(await prisma.organization.count({ where: { name: data.organization } })).toBe(0);
    expect(emails.sent).toHaveLength(0);
  });

  it("refuses an organization that already exists, ignoring case: a typo must not create a twin", async () => {
    const data = input();
    await createFirstAccount(data, { emailSender: emails, baseUrl: BASE_URL });
    await expect(createFirstAccount({ ...input(), organization: data.organization.toUpperCase() }, { emailSender: emails, baseUrl: BASE_URL })).rejects.toThrow(/já existe/);
  });

  it("normalizes the e-mail", async () => {
    const email = uniqueEmail("caixa-alta");
    const { practiceId } = await createFirstAccount(input({ email: `  ${email.toUpperCase()} ` }), { emailSender: emails, baseUrl: BASE_URL });
    expect((await prisma.invitation.findFirstOrThrow({ where: { practiceId } })).email).toBe(email);
  });
});

describe("the first admin's invitation", () => {
  it("makes a new user an admin of the organization, who reaches the practice", async () => {
    const { organizationId, practiceId, token } = await create();
    const { userId } = await acceptInvitationAsNewUser(token, { name: "Primeira Pessoa", password: TEST_PASSWORD, acceptTerms: true });

    expect(await getPracticeAccess(userId, practiceId)).toMatchObject({ role: "ORG_ADMIN", organizationId });
    await expect(prisma.organizationMember.findUniqueOrThrow({ where: { organizationId_userId: { organizationId, userId } } })).resolves.toMatchObject({ role: "ADMIN", revokedAt: null });
    // The alerts of a disconnected instance go to the practice's managers (D-54).
    await expect(prisma.membership.findUniqueOrThrow({ where: { practiceId_userId: { practiceId, userId } } })).resolves.toMatchObject({ role: "PRACTICE_MANAGER", revokedAt: null });
  });

  it("makes someone who already has a login an admin too", async () => {
    const user = await createUser("ja-tem-login");
    const { organizationId, practiceId, token } = await create({ email: user.email });
    await acceptInvitationAsExistingUser(token, { id: user.id, email: user.email });
    expect(await getPracticeAccess(user.id, practiceId)).toMatchObject({ role: "ORG_ADMIN", organizationId });
  });

  it("records who became admin", async () => {
    const { practiceId, token } = await create();
    const { userId } = await acceptInvitationAsNewUser(token, { name: "Primeira Pessoa", password: TEST_PASSWORD, acceptTerms: true });
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { practiceId, action: "organization_admin.added" } });
    expect(event).toMatchObject({ actorType: "USER", actorUserId: userId, entityType: "OrganizationMember" });
  });

  it("works once", async () => {
    const { token } = await create();
    await acceptInvitationAsNewUser(token, { name: "Primeira Pessoa", password: TEST_PASSWORD, acceptTerms: true });
    await expect(acceptInvitationAsNewUser(token, { name: "Outra", password: TEST_PASSWORD, acceptTerms: true })).rejects.toMatchObject({ code: "used" });
  });

  it("is not what an invitation from the screen grants", async () => {
    const { organizationId, practiceId, token } = await create();
    const { userId } = await acceptInvitationAsNewUser(token, { name: "Admin", password: TEST_PASSWORD, acceptTerms: true });

    const context = await contextAs({ practiceId, organizationId }, "ORG_ADMIN");
    const screenEmails = new MemoryEmailSender();
    const email = uniqueEmail("gestora-comum");
    await createInvitation(context, { email, role: "PRACTICE_MANAGER" }, { emailSender: screenEmails, baseUrl: BASE_URL });
    const manager = await acceptInvitationAsNewUser(tokenOf(screenEmails.sent[0]), { name: "Gestora", password: TEST_PASSWORD, acceptTerms: true });

    expect(await getPracticeAccess(manager.userId, practiceId)).toMatchObject({ role: "PRACTICE_MANAGER" });
    expect(await prisma.organizationMember.count({ where: { organizationId, userId: manager.userId } })).toBe(0);
    expect(await prisma.organizationMember.count({ where: { organizationId, userId } })).toBe(1);
  });
});

describe("reissueAdminInvitation", () => {
  it("replaces an expired invitation, the only way in to a practice with nobody", async () => {
    const { practiceId, token } = await create();
    await prisma.invitation.updateMany({ where: { practiceId }, data: { expiresAt: new Date(Date.now() - 1_000) } });
    expect(await getInvitation(token)).toMatchObject({ status: "expired" });

    const email = uniqueEmail("segundo-convite");
    const reissued = await reissueAdminInvitation({ practiceId, email }, { emailSender: emails, baseUrl: BASE_URL });
    expect(reissued.delivered).toBe(true);
    const { userId } = await acceptInvitationAsNewUser(tokenOf(emails.sent.at(-1)!), { name: "Pessoa", password: TEST_PASSWORD, acceptTerms: true });
    expect(await getPracticeAccess(userId, practiceId)).toMatchObject({ role: "ORG_ADMIN" });
  });

  it("cancels the invitation still pending, so an old link stops working", async () => {
    const { practiceId, token } = await create();
    await reissueAdminInvitation({ practiceId, email: uniqueEmail("outro") }, { emailSender: emails, baseUrl: BASE_URL });
    expect(await getInvitation(token)).toMatchObject({ status: "revoked" });
  });

  it("refuses once the organization has an active admin, who invites from the screen", async () => {
    const { practiceId, token } = await create();
    await acceptInvitationAsNewUser(token, { name: "Admin", password: TEST_PASSWORD, acceptTerms: true });
    await expect(reissueAdminInvitation({ practiceId, email: uniqueEmail("tarde") }, { emailSender: emails, baseUrl: BASE_URL })).rejects.toThrow(/já tem admin/);
  });

  it("refuses a practice that does not exist", async () => {
    await expect(reissueAdminInvitation({ practiceId: randomUUID(), email: uniqueEmail("ninguem") }, { emailSender: emails, baseUrl: BASE_URL })).rejects.toBeInstanceOf(OperatorError);
  });
});

describe("addPracticeToOrganization", () => {
  it("adds a practice the organization's admin reaches at once, with no new invitation", async () => {
    const { organizationId, token } = await create();
    const { userId } = await acceptInvitationAsNewUser(token, { name: "Admin", password: TEST_PASSWORD, acceptTerms: true });
    const before = (await listPracticeAccess(userId)).length;

    const organization = (await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } })).name;
    const added = await addPracticeToOrganization({ organization, practice: "Segunda clínica", location: "Unidade Sul", address: "Rua Teste, 200", timeZone: "America/Manaus" });

    expect(await getPracticeAccess(userId, added.practiceId)).toMatchObject({ role: "ORG_ADMIN", organizationId });
    expect(await listPracticeAccess(userId)).toHaveLength(before + 1);
    expect(await prisma.invitation.count({ where: { practiceId: added.practiceId } })).toBe(0);
    const actions = await prisma.auditEvent.findMany({ where: { practiceId: added.practiceId }, select: { action: true, actorType: true } });
    expect(actions).toEqual(expect.arrayContaining([{ action: "practice.created", actorType: "SYSTEM" }, { action: "location.created", actorType: "SYSTEM" }]));
  });

  it("refuses an organization that does not exist", async () => {
    await expect(addPracticeToOrganization({ organization: `Nenhuma ${randomUUID()}`, practice: "X", location: "Y", address: "Z", timeZone: "America/Fortaleza" })).rejects.toThrow(/não existe/);
  });

  it("refuses a name that matches two organizations", async () => {
    const name = `Repetida ${randomUUID().slice(0, 8)}`;
    await createPractice("A", { organizationId: (await prisma.organization.create({ data: { name } })).id });
    await createPractice("B", { organizationId: (await prisma.organization.create({ data: { name: name.toUpperCase() } })).id });
    await expect(addPracticeToOrganization({ organization: name, practice: "X", location: "Y", address: "Z", timeZone: "America/Fortaleza" })).rejects.toThrow(/mais de uma/);
  });
});
