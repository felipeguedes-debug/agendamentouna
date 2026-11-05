import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  addMember,
  addOrganizationAdmin,
  createPractice,
  createUser,
  interruption,
  setRequestCookie,
  signIn,
} from "../../../../../../tests/helpers/auth";
import CadencePage from "./page";

vi.mock("next/headers");

// Block 2 done criterion (PRD 12): the secretary does not reach the cadence screen;
// the manager does. Renders the real page with each user's session cookie.

let organizationId: string;
let practiceId: string;

beforeAll(async () => {
  ({ organizationId, practiceId } = await createPractice("Consultório Régua"));
  await prisma.cadence.create({ data: { practiceId, name: "Consulta padrão" } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function openCadenceScreenAs(setup: (userId: string) => Promise<unknown>) {
  const user = await createUser("cadence-screen");
  await setup(user.id);
  await setRequestCookie(await signIn(user.email));
  return interruption(
    CadencePage({ params: Promise.resolve({ practiceId }), searchParams: Promise.resolve({}) }),
  );
}

const asMember = (role: Role) => (userId: string) => addMember(userId, practiceId, role);

describe("cadence screen", () => {
  it("is forbidden to the secretary", async () => {
    expect(await openCadenceScreenAs(asMember("SECRETARY"))).toBe("forbidden");
  });

  it("is forbidden to the professional", async () => {
    expect(await openCadenceScreenAs(asMember("PROFESSIONAL"))).toBe("forbidden");
  });

  it("opens for the practice manager", async () => {
    expect(await openCadenceScreenAs(asMember("PRACTICE_MANAGER"))).toBe("rendered");
  });

  it("opens for the organization admin", async () => {
    expect(await openCadenceScreenAs((userId) => addOrganizationAdmin(userId, organizationId))).toBe("rendered");
  });

  it("does not exist for a manager of another practice", async () => {
    const other = (await createPractice("Outra conta")).practiceId;
    expect(await openCadenceScreenAs((userId) => addMember(userId, other, "PRACTICE_MANAGER"))).toBe("not-found");
  });

  it("sends a visitor without session to the login page", async () => {
    await setRequestCookie("");
    expect(
      await interruption(CadencePage({ params: Promise.resolve({ practiceId }), searchParams: Promise.resolve({}) })),
    ).toBe("redirect:/login");
  });
});
