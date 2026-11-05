import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPracticeAccess, practiceContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { addMember, addOrganizationAdmin, createPractice, createUser } from "../../../tests/helpers/auth";
import { listMembers, revokeMembership } from "./members";

// "Desligar um usuário remove o acesso na hora e mantém o histórico" (PRD 3, req. 5).

type User = Awaited<ReturnType<typeof createUser>>;

let organizationId: string;
let practiceId: string;
let admin: User;
let manager: User;

beforeAll(async () => {
  ({ organizationId, practiceId } = await createPractice("Consultório Equipe"));
  admin = await createUser("team-admin");
  await addOrganizationAdmin(admin.id, organizationId);
  manager = await createUser("team-manager");
  await addMember(manager.id, practiceId, "PRACTICE_MANAGER");
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function contextOf(user: User) {
  return practiceContext(user, (await getPracticeAccess(user.id, practiceId))!);
}

describe("listMembers", () => {
  it("lists active members with name, email and role", async () => {
    const secretary = await createUser("listed");
    await addMember(secretary.id, practiceId, "SECRETARY");
    const gone = await createUser("gone");
    await addMember(gone.id, practiceId, "SECRETARY", { revoked: true });

    const members = await listMembers(await contextOf(manager));
    expect(members.map((member) => member.email)).toContain(secretary.email);
    expect(members.map((member) => member.email)).not.toContain(gone.email);
    expect(members.find((member) => member.email === secretary.email)).toMatchObject({
      name: secretary.name,
      role: "SECRETARY",
    });
  });
});

describe("revokeMembership", () => {
  it("removes access at once and keeps the membership row for history", async () => {
    const secretary = await createUser("to-revoke");
    const membership = await addMember(secretary.id, practiceId, "SECRETARY");

    await revokeMembership(await contextOf(admin), membership.id);
    expect(await getPracticeAccess(secretary.id, practiceId)).toBeNull();
    expect((await prisma.membership.findUniqueOrThrow({ where: { id: membership.id } })).revokedAt).toBeInstanceOf(Date);
    expect(
      await prisma.auditEvent.count({ where: { practiceId, action: "membership.revoked", entityId: membership.id } }),
    ).toBe(1);
  });

  it("is reserved to the organization admin", async () => {
    const secretary = await createUser("kept");
    const membership = await addMember(secretary.id, practiceId, "SECRETARY");

    await expect(revokeMembership(await contextOf(manager), membership.id)).rejects.toMatchObject({
      code: "not_allowed",
    });
  });

  it("does not let a user revoke their own access", async () => {
    const own = await addMember(admin.id, practiceId, "PRACTICE_MANAGER");
    await expect(revokeMembership(await contextOf(admin), own.id)).rejects.toMatchObject({ code: "cannot_revoke_self" });
  });
});
