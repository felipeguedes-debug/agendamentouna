import { afterAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { addMember, createPractice, createUser, enableTwoFactor, interruption, setRequestCookie, signIn } from "../../../../../../tests/helpers/auth";
import { setTwoFactorRequiredAction } from "./actions";

vi.mock("next/headers");
// refresh() only runs inside a real Server Action request.
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

// The Server Action behind "Exigir verificação em duas etapas" (D-36, D-71), with each
// user's session cookie.

afterAll(async () => {
  await prisma.$disconnect();
});

const requiredIn = async (practiceId: string) => (await prisma.practice.findUniqueOrThrow({ where: { id: practiceId } })).requireTwoFactor;

async function signedInAs(practiceId: string, role: Role, options: { twoFactor?: boolean } = {}) {
  const user = await createUser("settings-action");
  await addMember(user.id, practiceId, role);
  const cookie = await signIn(user.email);
  await setRequestCookie(options.twoFactor ? (await enableTwoFactor(cookie)).cookie : cookie);
  return user;
}

describe("setTwoFactorRequiredAction", () => {
  it("switches on for the manager who has set it up, who stays on the screen", async () => {
    const { practiceId } = await createPractice("Ação com 2FA");
    await signedInAs(practiceId, "PRACTICE_MANAGER", { twoFactor: true });

    await expect(setTwoFactorRequiredAction(practiceId, true)).resolves.toEqual({ saved: true });

    expect(await requiredIn(practiceId)).toBe(true);
  });

  it("takes the manager who has not set it up to the security page, with the change made", async () => {
    const { practiceId } = await createPractice("Ação sem 2FA");
    await signedInAs(practiceId, "PRACTICE_MANAGER");

    expect(await interruption(setTwoFactorRequiredAction(practiceId, true))).toBe("redirect:/seguranca");

    expect(await requiredIn(practiceId)).toBe(true);
  });

  it("lets the manager switch it off only after setting it up, like every other screen", async () => {
    const { practiceId } = await createPractice("Ação bloqueada", { requireTwoFactor: true });
    const manager = await createUser("settings-action");
    await addMember(manager.id, practiceId, "PRACTICE_MANAGER");
    const cookie = await signIn(manager.email);
    await setRequestCookie(cookie);

    expect(await interruption(setTwoFactorRequiredAction(practiceId, false))).toBe("redirect:/seguranca");
    expect(await requiredIn(practiceId)).toBe(true);

    await setRequestCookie((await enableTwoFactor(cookie)).cookie);
    await expect(setTwoFactorRequiredAction(practiceId, false)).resolves.toEqual({ saved: true });
    expect(await requiredIn(practiceId)).toBe(false);
  });

  it("is forbidden to the secretary and the professional", async () => {
    const { practiceId } = await createPractice("Ação proibida");
    for (const role of ["SECRETARY", "PROFESSIONAL"] as const) {
      await signedInAs(practiceId, role);
      expect(await interruption(setTwoFactorRequiredAction(practiceId, true))).toBe("forbidden");
    }
    expect(await requiredIn(practiceId)).toBe(false);
  });

  it("does not exist for a manager of another practice", async () => {
    const { practiceId } = await createPractice("Ação alheia");
    const other = await createPractice("Conta do gestor");
    await signedInAs(other.practiceId, "PRACTICE_MANAGER");

    expect(await interruption(setTwoFactorRequiredAction(practiceId, true))).toBe("not-found");
    expect(await requiredIn(practiceId)).toBe(false);
  });
});
