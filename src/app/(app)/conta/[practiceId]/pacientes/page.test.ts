import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { addMember, createUser, interruption, setRequestCookie, signIn } from "../../../../../../tests/helpers/auth";
import { createAgendaFixture, type AgendaFixture } from "../../../../../../tests/helpers/practice";
import PatientPage from "./[patientId]/page";
import ImportPage from "./importar/page";
import PatientsPage from "./page";

vi.mock("next/headers");

// Who opens the Block 4 screens (D-47 to D-50): the office sees patients, the
// professional does not; only the manager and the admin import; a patient of
// another practice answers as nonexistent.

let fixture: AgendaFixture;
let other: AgendaFixture;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Telas Pacientes");
  other = await createAgendaFixture("Consultório Telas Pacientes Outro");
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signInAs(role: Role) {
  const user = await createUser(`pacientes-${role.toLowerCase()}`);
  await addMember(user.id, fixture.practiceId, role);
  await setRequestCookie(await signIn(user.email));
}

const listParams = (searchParams: Record<string, string> = {}) => ({
  params: Promise.resolve({ practiceId: fixture.practiceId }),
  searchParams: Promise.resolve(searchParams),
});

const patientParams = (patientId: string) => ({
  params: Promise.resolve({ practiceId: fixture.practiceId, patientId }),
  searchParams: Promise.resolve({}),
});

describe("patients screen", () => {
  it("opens for the manager and the secretary, with any search and page", async () => {
    for (const role of ["PRACTICE_MANAGER", "SECRETARY"] satisfies Role[]) {
      await signInAs(role);
      expect(await interruption(PatientsPage(listParams())), role).toBe("rendered");
      expect(await interruption(PatientsPage(listParams({ busca: "maria", pagina: "x" }))), role).toBe("rendered");
    }
  });

  it("is forbidden to the professional", async () => {
    await signInAs("PROFESSIONAL");
    expect(await interruption(PatientsPage(listParams()))).toBe("forbidden");
    expect(await interruption(PatientPage(patientParams(fixture.patient.id)))).toBe("forbidden");
  });
});

describe("patient screen", () => {
  it("opens a patient of the practice and answers 404 for another practice's or a bad id", async () => {
    await signInAs("SECRETARY");
    expect(await interruption(PatientPage(patientParams(fixture.patient.id)))).toBe("rendered");
    expect(await interruption(PatientPage(patientParams(other.patient.id)))).toBe("not-found");
    expect(await interruption(PatientPage(patientParams("qualquer")))).toBe("not-found");
  });

  it("opens an anonymized patient, whose appointments stay", async () => {
    await signInAs("PRACTICE_MANAGER");
    const erased = await fixture.db.patient.create({ data: { practiceId: fixture.practiceId, name: "Paciente excluído", anonymizedAt: new Date() } });
    expect(await interruption(PatientPage(patientParams(erased.id)))).toBe("rendered");
  });
});

describe("import screen", () => {
  it("opens for the manager and is forbidden to the secretary", async () => {
    await signInAs("PRACTICE_MANAGER");
    expect(await interruption(ImportPage(listParams()))).toBe("rendered");
    await signInAs("SECRETARY");
    expect(await interruption(ImportPage(listParams()))).toBe("forbidden");
  });
});
