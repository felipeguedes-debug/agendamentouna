import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addMember, addOrganizationAdmin, createPractice, createUser } from "../../../tests/helpers/auth";
import { getPracticeAccess, isTwoFactorRequired, listPracticeAccess } from "./access";

// Which practices a user reaches and with which role (PRD 3; D-39).

let orgId: string;
let alpha: string;
let beta: string;
let otherOrgPractice: string;

beforeAll(async () => {
  const first = await createPractice("Alpha");
  orgId = first.organizationId;
  alpha = first.practiceId;
  beta = (await createPractice("Beta", { organizationId: orgId })).practiceId;
  otherOrgPractice = (await createPractice("Outra organização")).practiceId;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("listPracticeAccess", () => {
  it("lists the practices of active memberships with their role", async () => {
    const user = await createUser("secretary");
    await addMember(user.id, alpha, "SECRETARY");
    await addMember(user.id, beta, "PRACTICE_MANAGER");

    const access = await listPracticeAccess(user.id);
    expect(access.map(({ practiceId, role }) => ({ practiceId, role }))).toEqual([
      { practiceId: alpha, role: "SECRETARY" },
      { practiceId: beta, role: "PRACTICE_MANAGER" },
    ]);
    expect(access[0].practiceName).toBe("Alpha");
  });

  it("drops revoked memberships", async () => {
    const user = await createUser("revoked");
    await addMember(user.id, alpha, "SECRETARY", { revoked: true });
    await addMember(user.id, beta, "SECRETARY");

    expect((await listPracticeAccess(user.id)).map((access) => access.practiceId)).toEqual([beta]);
  });

  it("gives the organization admin every practice of the organization, and nothing else", async () => {
    const admin = await createUser("admin");
    await addOrganizationAdmin(admin.id, orgId);
    await addMember(admin.id, alpha, "SECRETARY");

    const access = await listPracticeAccess(admin.id);
    expect(access.map(({ practiceId, role }) => ({ practiceId, role }))).toEqual([
      { practiceId: alpha, role: "ORG_ADMIN" },
      { practiceId: beta, role: "ORG_ADMIN" },
    ]);
    expect(access.some((entry) => entry.practiceId === otherOrgPractice)).toBe(false);
  });

  it("drops a revoked organization admin", async () => {
    const admin = await createUser("former-admin");
    await addOrganizationAdmin(admin.id, orgId, { revoked: true });

    expect(await listPracticeAccess(admin.id)).toEqual([]);
  });
});

describe("getPracticeAccess", () => {
  it("returns the role in one practice", async () => {
    const user = await createUser("manager");
    await addMember(user.id, alpha, "PRACTICE_MANAGER");

    expect(await getPracticeAccess(user.id, alpha)).toMatchObject({ practiceId: alpha, role: "PRACTICE_MANAGER" });
  });

  it("returns null for another practice, a revoked membership or a malformed id", async () => {
    const user = await createUser("outsider");
    await addMember(user.id, alpha, "SECRETARY");
    await addMember(user.id, beta, "SECRETARY", { revoked: true });

    expect(await getPracticeAccess(user.id, otherOrgPractice)).toBeNull();
    expect(await getPracticeAccess(user.id, beta)).toBeNull();
    expect(await getPracticeAccess(user.id, "not-a-uuid")).toBeNull();
  });

  it("gives the organization admin access to a practice without membership", async () => {
    const admin = await createUser("org-admin");
    await addOrganizationAdmin(admin.id, orgId);

    expect(await getPracticeAccess(admin.id, beta)).toMatchObject({ role: "ORG_ADMIN" });
    expect(await getPracticeAccess(admin.id, otherOrgPractice)).toBeNull();
  });
});

describe("isTwoFactorRequired (D-16)", () => {
  it("is true when any reachable practice requires it", async () => {
    const strict = (await createPractice("Exige 2FA", { requireTwoFactor: true })).practiceId;
    const user = await createUser("strict");
    await addMember(user.id, alpha, "SECRETARY");
    expect(await isTwoFactorRequired(user.id)).toBe(false);

    await addMember(user.id, strict, "SECRETARY");
    expect(await isTwoFactorRequired(user.id)).toBe(true);
  });

  it("ignores practices the user no longer reaches", async () => {
    const strict = (await createPractice("Exige 2FA, revogada", { requireTwoFactor: true })).practiceId;
    const user = await createUser("strict-revoked");
    await addMember(user.id, strict, "SECRETARY", { revoked: true });

    expect(await isTwoFactorRequired(user.id)).toBe(false);
  });

  it("counts practices reached as organization admin", async () => {
    const { organizationId } = await createPractice("Org exige 2FA", { requireTwoFactor: true });
    const admin = await createUser("strict-admin");
    await addOrganizationAdmin(admin.id, organizationId);

    expect(await isTwoFactorRequired(admin.id)).toBe(true);
  });
});
