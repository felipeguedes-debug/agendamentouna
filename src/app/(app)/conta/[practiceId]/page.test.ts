import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { addMember, createUser, interruption, setRequestCookie, signIn } from "../../../../../tests/helpers/auth";
import { createAgendaFixture, type AgendaFixture } from "../../../../../tests/helpers/practice";
import AgendaPage from "./page";
import AppointmentPage from "./agendamentos/[appointmentId]/page";
import NewAppointmentPage from "./agendamentos/novo/page";
import AppointmentTypesPage from "./tipos/page";

vi.mock("next/headers");

// Who opens the Block 3 screens (PRD 3 and 4): every role sees an agenda, only
// those who book open the booking form, and an appointment of another practice
// or of another professional answers as nonexistent.

let fixture: AgendaFixture;
let other: AgendaFixture;
let appointmentId: string;
let otherAppointmentId: string;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Telas");
  other = await createAgendaFixture("Consultório Telas Outro");
  const appointment = (data: AgendaFixture, professionalId: string) => ({
    practiceId: data.practiceId,
    locationId: data.locations.aldeota.id,
    professionalId,
    patientId: data.patient.id,
    appointmentTypeId: data.types.consultation.id,
    startsAt: new Date("2026-11-10T11:00:00Z"),
    endsAt: new Date("2026-11-10T11:30:00Z"),
    durationMinutes: 30,
    priceCents: 45000,
  });
  appointmentId = (await fixture.db.appointment.create({ data: appointment(fixture, fixture.professionals.bruno.id) })).id;
  otherAppointmentId = (await other.db.appointment.create({ data: appointment(other, other.professionals.ana.id) })).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signInAs(role: Role) {
  const user = await createUser(`telas-${role.toLowerCase()}`);
  await addMember(user.id, fixture.practiceId, role);
  if (role === "PROFESSIONAL") {
    await fixture.db.professional.update({ where: { id: fixture.professionals.ana.id }, data: { userId: user.id } });
  }
  await setRequestCookie(await signIn(user.email));
}

const params = () => ({
  params: Promise.resolve({ practiceId: fixture.practiceId }),
  searchParams: Promise.resolve({}),
});

const appointmentParams = (appointmentId: string) => ({
  params: Promise.resolve({ practiceId: fixture.practiceId, appointmentId }),
  searchParams: Promise.resolve({}),
});

describe("agenda screen", () => {
  it("opens for every practice role", async () => {
    for (const role of ["PRACTICE_MANAGER", "SECRETARY", "PROFESSIONAL"] satisfies Role[]) {
      await signInAs(role);
      expect(await interruption(AgendaPage(params())), role).toBe("rendered");
    }
  });

  it("accepts every view and ignores invalid parameters", async () => {
    await signInAs("SECRETARY");
    for (const visao of ["dia", "semana", "mes", "lista", "qualquer"]) {
      const page = AgendaPage({
        params: Promise.resolve({ practiceId: fixture.practiceId }),
        searchParams: Promise.resolve({ visao, data: "2026-02-30", profissional: "todos", categoria: "X", status: "Y" }),
      });
      expect(await interruption(page), visao).toBe("rendered");
    }
  });
});

describe("appointment types screen", () => {
  it("opens for the manager, the secretary and the professional", async () => {
    for (const role of ["PRACTICE_MANAGER", "SECRETARY", "PROFESSIONAL"] satisfies Role[]) {
      await signInAs(role);
      expect(await interruption(AppointmentTypesPage(params())), role).toBe("rendered");
    }
  });
});

describe("new appointment screen", () => {
  it("is forbidden to the professional and opens for the secretary", async () => {
    await signInAs("PROFESSIONAL");
    expect(await interruption(NewAppointmentPage(params()))).toBe("forbidden");
    await signInAs("SECRETARY");
    expect(await interruption(NewAppointmentPage(params()))).toBe("rendered");
  });
});

describe("appointment screen", () => {
  it("opens an appointment of the practice", async () => {
    await signInAs("SECRETARY");
    expect(await interruption(AppointmentPage(appointmentParams(appointmentId)))).toBe("rendered");
  });

  it("answers as nonexistent for an appointment of another practice or a malformed id", async () => {
    await signInAs("SECRETARY");
    expect(await interruption(AppointmentPage(appointmentParams(otherAppointmentId)))).toBe("not-found");
    expect(await interruption(AppointmentPage(appointmentParams("nao-existe")))).toBe("not-found");
  });

  it("answers as nonexistent to a professional for another professional's appointment", async () => {
    await signInAs("PROFESSIONAL");
    expect(await interruption(AppointmentPage(appointmentParams(appointmentId)))).toBe("not-found");
  });
});
