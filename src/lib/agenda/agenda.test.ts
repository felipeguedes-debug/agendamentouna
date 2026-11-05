import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { listWithoutClosing, loadAgenda, periodOf } from "./agenda";

// Agenda views, filters, the value panel (D-13) and the "Sem baixa" list.

let fixture: AgendaFixture;

// The week of Monday 2026-11-09, in Fortaleza (UTC-3) unless the location says otherwise.
async function book(input: {
  at: string;
  status?: AppointmentStatus;
  professional?: "ana" | "bruno";
  location?: "aldeota" | "manaus";
  type?: "consultation" | "procedure";
  priceCents?: number;
  noConfirmation?: boolean;
}) {
  const type = fixture.types[input.type ?? "consultation"];
  const startsAt = new Date(input.at);
  return fixture.db.appointment.create({
    data: {
      practiceId: fixture.practiceId,
      locationId: fixture.locations[input.location ?? "aldeota"].id,
      professionalId: fixture.professionals[input.professional ?? "ana"].id,
      patientId: fixture.patient.id,
      appointmentTypeId: type.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + type.durationMinutes * 60_000),
      durationMinutes: type.durationMinutes,
      priceCents: input.priceCents ?? type.defaultPriceCents,
      status: input.status ?? "SCHEDULED",
      flags: input.noConfirmation ? { create: { type: "NO_CONFIRMATION" } } : undefined,
    },
  });
}

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Visões");
  await book({ at: "2026-11-09T11:00:00Z", status: "COMPLETED" }); // Mon 08:00, 450
  await book({ at: "2026-11-09T12:00:00Z", status: "NO_SHOW" }); // Mon 09:00, 450
  await book({ at: "2026-11-10T11:00:00Z", status: "CANCELED_BY_PATIENT" }); // Tue 08:00, out of the value
  await book({ at: "2026-11-10T12:00:00Z", status: "RESCHEDULED" }); // Tue 09:00, out of the value
  await book({ at: "2026-11-11T11:00:00Z", type: "procedure", noConfirmation: true }); // Wed 08:00, 800
  await book({ at: "2026-11-12T13:00:00Z", professional: "bruno", status: "CONFIRMED" }); // Thu 10:00, 450
  // Sunday 22:30 in Manaus is already Monday in UTC: it belongs to Sunday.
  await book({ at: "2026-11-16T02:30:00Z", location: "manaus" });
  // Next week: outside the period.
  await book({ at: "2026-11-16T11:00:00Z" });
  await fixture.db.timeBlock.create({
    data: {
      practiceId: fixture.practiceId,
      professionalId: fixture.professionals.ana.id,
      startsAt: new Date("2026-11-12T11:00:00Z"),
      endsAt: new Date("2026-11-12T13:00:00Z"),
      source: "GOOGLE",
      reason: "Compromisso Google",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const week = { view: "semana" as const, date: "2026-11-11", professionalId: null, category: null, status: null };

describe("periodOf", () => {
  it("maps each view to its days", () => {
    expect(periodOf("dia", "2026-11-11")).toEqual({ start: "2026-11-11", endExclusive: "2026-11-12" });
    expect(periodOf("lista", "2026-11-11")).toEqual({ start: "2026-11-11", endExclusive: "2026-11-12" });
    expect(periodOf("semana", "2026-11-11")).toEqual({ start: "2026-11-09", endExclusive: "2026-11-16" });
    expect(periodOf("mes", "2026-11-11")).toEqual({ start: "2026-11-01", endExclusive: "2026-12-01" });
  });
});

describe("loadAgenda", () => {
  it("places each appointment on its location's local day and hour", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const agenda = await loadAgenda(secretary, week);
    const appointments = agenda.items.filter((item) => item.kind === "appointment");
    expect(appointments).toHaveLength(7);
    expect(appointments.map((item) => `${item.date} ${item.time}`)).toContain("2026-11-15 22:30");
    expect(appointments.map((item) => item.date)).not.toContain("2026-11-16");
    expect(agenda.items.find((item) => item.kind === "block")).toMatchObject({ date: "2026-11-12", time: "08:00", endTime: "10:00", source: "GOOGLE" });
    expect(agenda.timeZone).toBe("America/Fortaleza");
  });

  it("adds up the value panel with the D-13 definitions", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const { totals } = await loadAgenda(secretary, week);
    // Previsto: Completed 450 + No-show 450 + Scheduled 800 + Confirmed 450 + Scheduled (Manaus) 450.
    expect(totals).toEqual({ scheduled: 5, withoutConfirmation: 1, predictedCents: 260000, realizedCents: 45000 });
  });

  it("combines professional, category and status filters", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const bruno = await loadAgenda(secretary, { ...week, professionalId: fixture.professionals.bruno.id });
    expect(bruno.items.map((item) => item.kind)).toEqual(["appointment"]);
    const procedures = await loadAgenda(secretary, { ...week, category: "PROCEDURE" });
    expect(procedures.items.map((item) => item.kind === "appointment" && item.typeName)).toEqual(["Escleroterapia"]);
    const blocks = await loadAgenda(secretary, { ...week, category: "BLOCK" });
    expect(blocks.items.map((item) => item.kind)).toEqual(["block"]);
    const unconfirmed = await loadAgenda(secretary, { ...week, status: "NO_CONFIRMATION" });
    expect(unconfirmed.items.map((item) => item.kind === "appointment" && item.noConfirmation)).toEqual([true]);
    const completedProcedures = await loadAgenda(secretary, { ...week, category: "PROCEDURE", status: "COMPLETED" });
    expect(completedProcedures.items).toEqual([]);
  });

  it("shows the professional only their own agenda, whatever the filter says", async () => {
    const bruno = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.bruno.id });
    const agenda = await loadAgenda(bruno, { ...week, professionalId: fixture.professionals.ana.id });
    expect(agenda.ownOnly).toBe(true);
    expect(agenda.professionals.map((professional) => professional.name)).toEqual(["Dr. Bruno Teste"]);
    expect(agenda.items.every((item) => item.professionalId === fixture.professionals.bruno.id)).toBe(true);
    expect(agenda.items).toHaveLength(1);
  });

  it("covers the whole month in the month view", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const agenda = await loadAgenda(secretary, { ...week, view: "mes" });
    expect(agenda.days[0]).toBe("2026-11-01");
    expect(agenda.days.at(-1)).toBe("2026-11-30");
    expect(agenda.items.filter((item) => item.kind === "appointment")).toHaveLength(8);
  });
});

describe("listWithoutClosing (Sem baixa, D-13)", () => {
  it("lists open appointments once their local day is over", async () => {
    const local = await createAgendaFixture("Consultório Sem Baixa");
    const secretary = await contextAs(local, "SECRETARY");
    const create = (at: string, status: AppointmentStatus, location: "aldeota" | "manaus" = "aldeota") =>
      local.db.appointment.create({
        data: {
          practiceId: local.practiceId,
          locationId: local.locations[location].id,
          professionalId: local.professionals.ana.id,
          patientId: local.patient.id,
          appointmentTypeId: local.types.consultation.id,
          startsAt: new Date(at),
          endsAt: new Date(new Date(at).getTime() + 30 * 60_000),
          durationMinutes: 30,
          priceCents: 45000,
          status,
        },
      });
    const yesterdayOpen = await create("2026-11-09T11:00:00Z", "CONFIRMED");
    const yesterdayArrived = await create("2026-11-09T12:00:00Z", "ARRIVED");
    await create("2026-11-09T13:00:00Z", "COMPLETED");
    await create("2026-11-09T14:00:00Z", "CANCELED_BY_PRACTICE");
    // Earlier today: not yet "sem baixa", the day is not over.
    await create("2026-11-10T11:00:00Z", "SCHEDULED");
    // 23:30 yesterday in Manaus is already today in UTC.
    const lateManaus = await create("2026-11-10T03:30:00Z", "SCHEDULED", "manaus");

    const now = new Date("2026-11-10T15:00:00Z"); // 12:00 in Fortaleza
    const items = await listWithoutClosing(secretary, { professionalId: null, category: null, status: null }, now);
    expect(items.map((item) => item.id)).toEqual([yesterdayOpen.id, yesterdayArrived.id, lateManaus.id]);
  });
});
