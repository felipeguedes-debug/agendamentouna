import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { forPractice, prisma } from "@/lib/db";
import { addMember, createPractice, createUser, interruption, setRequestCookie, signIn } from "../../../../../../tests/helpers/auth";
import ProfessionalsPage from "./page";
import ProfessionalPage from "./[professionalId]/page";

vi.mock("next/headers");

// Professionals and their Google link (PRD 3: "Usuários e Google Agenda"; D-23):
// the manager and the organization admin; not the secretary, not the professional,
// who has "Meu perfil".

let practiceId: string;
let professionalId: string;

beforeAll(async () => {
  ({ practiceId } = await createPractice("Consultório Tela Profissionais"));
  professionalId = (await forPractice(practiceId).professional.create({ data: { practiceId, name: "Dra. Tela" } })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signInAs(role: Role) {
  const user = await createUser("professionals-screen");
  await addMember(user.id, practiceId, role);
  await setRequestCookie(await signIn(user.email));
}

describe("professionals screens", () => {
  it("open for the manager", async () => {
    await signInAs("PRACTICE_MANAGER");
    expect(await interruption(ProfessionalsPage({ params: Promise.resolve({ practiceId }), searchParams: Promise.resolve({}) }))).toBe("rendered");
    expect(await interruption(ProfessionalPage({ params: Promise.resolve({ practiceId, professionalId }), searchParams: Promise.resolve({}) }))).toBe("rendered");
  });

  it("are forbidden to the secretary and the professional", async () => {
    for (const role of ["SECRETARY", "PROFESSIONAL"] as const) {
      await signInAs(role);
      expect(await interruption(ProfessionalsPage({ params: Promise.resolve({ practiceId }), searchParams: Promise.resolve({}) }))).toBe("forbidden");
      expect(await interruption(ProfessionalPage({ params: Promise.resolve({ practiceId, professionalId }), searchParams: Promise.resolve({}) }))).toBe("forbidden");
    }
  });

  it("answer 404 for a professional that is not there", async () => {
    await signInAs("PRACTICE_MANAGER");
    expect(await interruption(ProfessionalPage({ params: Promise.resolve({ practiceId, professionalId: "00000000-0000-4000-8000-000000000000" }), searchParams: Promise.resolve({}) }))).toBe("not-found");
  });
});
