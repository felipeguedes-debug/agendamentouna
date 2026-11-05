import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { AgendaError } from "@/lib/agenda/errors";
import { forPractice, prisma } from "@/lib/db";
import { addMember, addOrganizationAdmin, createPractice, createUser, enableTwoFactor, interruption, setRequestCookie, signIn } from "../../../tests/helpers/auth";
import { getPracticeAccess, practiceContext } from "./access";
import { requirePracticeAccess } from "./guard";
import { getTwoFactorRequirement, setTwoFactorRequired } from "./two-factor-requirement";

vi.mock("next/headers");

// "Exigir 2FA" of Configurações da conta (PRD 11; D-16, D-36, D-71): who it reaches, what
// the audit trail keeps, and that the guard follows the switch.

afterAll(async () => {
  await prisma.$disconnect();
});

/** What the guard hands the page, read after the setup, so `requireTwoFactor` is current. */
async function contextOf(user: { id: string; name: string; email: string }, practiceId: string) {
  const access = await getPracticeAccess(user.id, practiceId);
  if (!access) throw new Error("The user does not reach the practice");
  return practiceContext(user, access);
}

async function memberOf(practiceId: string, role: Role, label = role.toLowerCase()) {
  const user = await createUser(label);
  await addMember(user.id, practiceId, role);
  return user;
}

const auditOf = (practiceId: string) => forPractice(practiceId).auditEvent.findMany({ where: { entityType: "Practice", action: { startsWith: "practice.two_factor" } }, orderBy: { occurredAt: "asc" } });
const requiredIn = async (practiceId: string) => (await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } })).requireTwoFactor;

describe("setTwoFactorRequired", () => {
  it("switches the requirement on and off, keeping only field names in the audit trail", async () => {
    const { practiceId } = await createPractice("Liga e desliga");
    const manager = await memberOf(practiceId, "PRACTICE_MANAGER");

    await setTwoFactorRequired(await contextOf(manager, practiceId), true);
    expect(await requiredIn(practiceId)).toBe(true);

    await setTwoFactorRequired(await contextOf(manager, practiceId), false);
    expect(await requiredIn(practiceId)).toBe(false);

    const events = await auditOf(practiceId);
    expect(events.map((event) => event.action)).toEqual(["practice.two_factor_required", "practice.two_factor_not_required"]);
    for (const event of events) {
      expect(event).toMatchObject({ actorType: "USER", actorUserId: manager.id, entityType: "Practice", entityId: practiceId, changedFields: ["requireTwoFactor"] });
    }
  });

  it("writes nothing when the practice is already that way", async () => {
    const { practiceId } = await createPractice("Já exige", { requireTwoFactor: true });
    const manager = await memberOf(practiceId, "PRACTICE_MANAGER");

    await setTwoFactorRequired(await contextOf(manager, practiceId), true);

    expect(await requiredIn(practiceId)).toBe(true);
    expect(await auditOf(practiceId)).toEqual([]);
  });

  it("is for those with practice-settings:edit (D-40)", async () => {
    const { organizationId, practiceId } = await createPractice("Só o gestor");
    for (const role of ["SECRETARY", "PROFESSIONAL"] as const) {
      const context = await contextOf(await memberOf(practiceId, role), practiceId);
      const refused = setTwoFactorRequired(context, true);
      await expect(refused).rejects.toBeInstanceOf(AgendaError);
      await expect(refused).rejects.toMatchObject({ code: "not_allowed" });
    }
    expect(await requiredIn(practiceId)).toBe(false);

    const admin = await createUser("org-admin");
    await addOrganizationAdmin(admin.id, organizationId);
    await setTwoFactorRequired(await contextOf(admin, practiceId), true);
    expect(await requiredIn(practiceId)).toBe(true);
  });

  it("changes only the manager's practice", async () => {
    const { organizationId, practiceId } = await createPractice("Esta conta");
    const other = await createPractice("Outra conta", { organizationId });
    const manager = await memberOf(practiceId, "PRACTICE_MANAGER");

    await setTwoFactorRequired(await contextOf(manager, practiceId), true);

    expect(await requiredIn(other.practiceId)).toBe(false);
    expect(await auditOf(other.practiceId)).toEqual([]);
  });
});

describe("what the guard does with the switch (D-36)", () => {
  async function requestAs(user: { email: string }) {
    await setRequestCookie(await signIn(user.email));
  }

  it("takes whoever has not set it up to the security page, the manager included, until it is switched off", async () => {
    const { practiceId } = await createPractice("Leva à segurança");
    const manager = await memberOf(practiceId, "PRACTICE_MANAGER");
    const secretary = await memberOf(practiceId, "SECRETARY");
    await setRequestCookie(await signIn(secretary.email));
    expect(await interruption(requirePracticeAccess(practiceId))).toBe("rendered");

    await setTwoFactorRequired(await contextOf(manager, practiceId), true);

    expect(await interruption(requirePracticeAccess(practiceId))).toBe("redirect:/seguranca");
    await requestAs(manager);
    expect(await interruption(requirePracticeAccess(practiceId))).toBe("redirect:/seguranca");

    await setTwoFactorRequired(await contextOf(manager, practiceId), false);
    expect(await interruption(requirePracticeAccess(practiceId))).toBe("rendered");
  });

  it("reaches the person in another practice too, since two-factor is the user's (D-16)", async () => {
    const { organizationId, practiceId } = await createPractice("Exige agora");
    const other = await createPractice("Não exige", { organizationId });
    const manager = await memberOf(practiceId, "PRACTICE_MANAGER");
    const secretary = await memberOf(other.practiceId, "SECRETARY");
    await addMember(secretary.id, practiceId, "SECRETARY");
    await requestAs(secretary);

    await setTwoFactorRequired(await contextOf(manager, practiceId), true);

    expect(await interruption(requirePracticeAccess(other.practiceId))).toBe("redirect:/seguranca");
  });

  it("lets through whoever already set it up, and switching off does not undo their setup", async () => {
    const { practiceId } = await createPractice("Já ativou");
    const manager = await memberOf(practiceId, "PRACTICE_MANAGER");
    const { cookie } = await enableTwoFactor(await signIn(manager.email));
    await setRequestCookie(cookie);

    await setTwoFactorRequired(await contextOf(manager, practiceId), true);
    expect(await interruption(requirePracticeAccess(practiceId))).toBe("rendered");

    await setTwoFactorRequired(await contextOf(manager, practiceId), false);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: manager.id } })).twoFactorEnabled).toBe(true);
  });
});

describe("getTwoFactorRequirement", () => {
  let fixture: { organizationId: string; practiceId: string };

  beforeAll(async () => {
    fixture = await createPractice("Quem falta");
  });

  it("is for those with practice-settings:edit", async () => {
    const context = await contextOf(await memberOf(fixture.practiceId, "SECRETARY", "reader"), fixture.practiceId);
    await expect(getTwoFactorRequirement(context)).rejects.toMatchObject({ code: "not_allowed" });
  });

  it("tells the manager that they have not set it up, apart from the others", async () => {
    const { practiceId } = await createPractice("Gestor sem 2FA");
    const manager = await memberOf(practiceId, "PRACTICE_MANAGER");
    const secretary = await memberOf(practiceId, "SECRETARY");

    expect(await getTwoFactorRequirement(await contextOf(manager, practiceId))).toEqual({ required: false, currentUserMissing: true, othersMissing: [secretary.name] });
  });

  it("does not list the manager who has set it up", async () => {
    const { practiceId } = await createPractice("Gestor com 2FA");
    const manager = await memberOf(practiceId, "PRACTICE_MANAGER");
    await enableTwoFactor(await signIn(manager.email));

    expect(await getTwoFactorRequirement(await contextOf(manager, practiceId))).toEqual({ required: false, currentUserMissing: false, othersMissing: [] });
  });

  it("lists everyone the guard would stop in this practice, and only them", async () => {
    const { organizationId, practiceId } = await createPractice("Alcance");
    const sister = await createPractice("Mesma organização", { organizationId });
    const elsewhere = await createPractice("Outra organização");
    const manager = await memberOf(practiceId, "PRACTICE_MANAGER");

    const member = await memberOf(practiceId, "PROFESSIONAL", "member");
    const admin = await createUser("admin");
    await addOrganizationAdmin(admin.id, organizationId);
    const both = await memberOf(practiceId, "SECRETARY", "both");
    await addOrganizationAdmin(both.id, organizationId);
    const protectedMember = await memberOf(practiceId, "SECRETARY", "protected");
    await enableTwoFactor(await signIn(protectedMember.email));

    const revoked = await createUser("revoked");
    await addMember(revoked.id, practiceId, "SECRETARY", { revoked: true });
    const revokedAdmin = await createUser("revoked-admin");
    await addOrganizationAdmin(revokedAdmin.id, organizationId, { revoked: true });
    await memberOf(sister.practiceId, "SECRETARY", "sister");
    const outsideAdmin = await createUser("outside-admin");
    await addOrganizationAdmin(outsideAdmin.id, elsewhere.organizationId);

    const { othersMissing } = await getTwoFactorRequirement(await contextOf(manager, practiceId));

    expect([...othersMissing].sort()).toEqual([member.name, admin.name, both.name].sort());
    // The list and the guard agree on each of them.
    await setTwoFactorRequired(await contextOf(manager, practiceId), true);
    for (const user of [member, admin, both]) {
      await setRequestCookie(await signIn(user.email));
      expect(await interruption(requirePracticeAccess(practiceId))).toBe("redirect:/seguranca");
    }
    for (const user of [revoked, revokedAdmin]) {
      await setRequestCookie(await signIn(user.email));
      expect(await interruption(requirePracticeAccess(practiceId))).toBe("not-found");
    }
  });

  it("answers what the practice has now", async () => {
    const { practiceId } = await createPractice("Estado atual", { requireTwoFactor: true });
    const manager = await memberOf(practiceId, "PRACTICE_MANAGER");

    expect((await getTwoFactorRequirement(await contextOf(manager, practiceId))).required).toBe(true);
  });
});
