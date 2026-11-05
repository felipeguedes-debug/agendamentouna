import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { forPractice, prisma } from "@/lib/db";
import { addMember, createPractice, createUser, interruption, setRequestCookie, signIn } from "../../../../../../tests/helpers/auth";
import OwnProfilePage from "./page";

vi.mock("next/headers");

// "Meu perfil" (D-23): the professional links their own Google Agenda (PRD 3).

let practiceId: string;

beforeAll(async () => {
  ({ practiceId } = await createPractice("Consultório Meu Perfil"));
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function openAs(role: Role, options: { ownRecord?: boolean } = {}) {
  const user = await createUser("own-profile");
  await addMember(user.id, practiceId, role);
  if (options.ownRecord) await forPractice(practiceId).professional.create({ data: { practiceId, name: "Dr. Perfil", userId: user.id } });
  await setRequestCookie(await signIn(user.email));
  return interruption(OwnProfilePage({ params: Promise.resolve({ practiceId }), searchParams: Promise.resolve({}) }));
}

describe("own profile", () => {
  it("opens for the professional with a record in the practice", async () => {
    expect(await openAs("PROFESSIONAL", { ownRecord: true })).toBe("rendered");
  });

  it("answers 404 to a professional without a record and 403 to the office", async () => {
    expect(await openAs("PROFESSIONAL")).toBe("not-found");
    expect(await openAs("SECRETARY")).toBe("forbidden");
    expect(await openAs("PRACTICE_MANAGER")).toBe("forbidden");
  });
});
