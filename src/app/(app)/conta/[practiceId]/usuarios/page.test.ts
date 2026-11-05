import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  addMember,
  createPractice,
  createUser,
  interruption,
  setRequestCookie,
  signIn,
} from "../../../../../../tests/helpers/auth";
import UsersPage from "./page";

vi.mock("next/headers");

// "Usuários e papéis": the manager and the admin invite; secretary and professional don't (PRD 3).

let practiceId: string;

beforeAll(async () => {
  practiceId = (await createPractice("Consultório Usuários")).practiceId;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function openUsersScreenAs(role: Role) {
  const user = await createUser("users-screen");
  await addMember(user.id, practiceId, role);
  await setRequestCookie(await signIn(user.email));
  return interruption(UsersPage({ params: Promise.resolve({ practiceId }), searchParams: Promise.resolve({}) }));
}

describe("users screen", () => {
  it("is forbidden to the secretary and the professional", async () => {
    expect(await openUsersScreenAs("SECRETARY")).toBe("forbidden");
    expect(await openUsersScreenAs("PROFESSIONAL")).toBe("forbidden");
  });

  it("opens for the practice manager", async () => {
    expect(await openUsersScreenAs("PRACTICE_MANAGER")).toBe("rendered");
  });
});
