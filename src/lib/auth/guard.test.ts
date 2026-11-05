import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  addMember,
  createPractice,
  createUser,
  interruption,
  setRequestCookie,
  signIn,
} from "../../../tests/helpers/auth";
import { requirePracticeAccess, requirePracticePermission, requireUser } from "./guard";

vi.mock("next/headers");

// The data access layer every page and Server Action of a practice goes through (D-40).

let practiceId: string;
let otherPracticeId: string;
let strictPracticeId: string;

beforeAll(async () => {
  practiceId = (await createPractice("Consultório Guarda")).practiceId;
  otherPracticeId = (await createPractice("Conta alheia")).practiceId;
  strictPracticeId = (await createPractice("Conta com 2FA", { requireTwoFactor: true })).practiceId;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signedInAs(role: "SECRETARY" | "PRACTICE_MANAGER", options: { practice?: string; revoked?: boolean } = {}) {
  const user = await createUser(role.toLowerCase());
  await addMember(user.id, options.practice ?? practiceId, role, { revoked: options.revoked });
  await setRequestCookie(await signIn(user.email));
  return user;
}

describe("requireUser", () => {
  it("sends a request without session to the login page", async () => {
    await setRequestCookie("");
    expect(await interruption(requireUser())).toBe("redirect:/login");
  });

  it("returns the signed-in user", async () => {
    const user = await signedInAs("SECRETARY");
    await expect(requireUser()).resolves.toMatchObject({ id: user.id, email: user.email });
  });

  it("sends a user who must have two-factor authentication to the security page (D-16)", async () => {
    await signedInAs("SECRETARY", { practice: strictPracticeId });
    expect(await interruption(requireUser())).toBe("redirect:/seguranca");
    await expect(requireUser({ allowMissingTwoFactor: true })).resolves.toBeDefined();
  });
});

describe("requirePracticeAccess", () => {
  it("returns the access and a client scoped to the practice", async () => {
    await signedInAs("SECRETARY");
    const { access, db } = await requirePracticeAccess(practiceId);

    expect(access).toMatchObject({ practiceId, role: "SECRETARY" });
    expect((await db.practice.findMany()).map((practice) => practice.id)).toEqual([practiceId]);
  });

  it("answers 404 for another practice, a revoked membership or a malformed id", async () => {
    await signedInAs("PRACTICE_MANAGER");
    expect(await interruption(requirePracticeAccess(otherPracticeId))).toBe("not-found");
    expect(await interruption(requirePracticeAccess("nao-e-uuid"))).toBe("not-found");

    await signedInAs("PRACTICE_MANAGER", { revoked: true });
    expect(await interruption(requirePracticeAccess(practiceId))).toBe("not-found");
  });
});

describe("requirePracticePermission", () => {
  it("answers 403 when the role lacks the permission", async () => {
    await signedInAs("SECRETARY");
    expect(await interruption(requirePracticePermission(practiceId, "cadence:edit"))).toBe("forbidden");
  });

  it("passes when the role has the permission", async () => {
    await signedInAs("PRACTICE_MANAGER");
    expect(await interruption(requirePracticePermission(practiceId, "cadence:edit"))).toBe("rendered");
  });
});
