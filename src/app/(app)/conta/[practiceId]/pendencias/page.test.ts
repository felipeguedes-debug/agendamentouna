import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { addMember, createPractice, createUser, interruption, setRequestCookie, signIn } from "../../../../../../tests/helpers/auth";
import PendingPage from "./page";

vi.mock("next/headers");

// Pendências (D-84) opens for the office and, with the Google rows of their own
// agenda, for the professional.

let practiceId: string;

beforeAll(async () => {
  ({ practiceId } = await createPractice("Consultório Pendências"));
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function openAs(role: Role, target = practiceId) {
  const user = await createUser("pending-screen");
  await addMember(user.id, target, role);
  await setRequestCookie(await signIn(user.email));
  return interruption(PendingPage({ params: Promise.resolve({ practiceId }), searchParams: Promise.resolve({}) }));
}

describe("pending screen", () => {
  it("opens for every role of the practice", async () => {
    expect(await openAs("SECRETARY")).toBe("rendered");
    expect(await openAs("PRACTICE_MANAGER")).toBe("rendered");
    expect(await openAs("PROFESSIONAL")).toBe("rendered");
  });

  it("does not exist for a member of another practice", async () => {
    const other = (await createPractice("Outra conta")).practiceId;
    expect(await openAs("SECRETARY", other)).toBe("not-found");
  });
});
