import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { todayIn, zonedToUtc } from "@/lib/dates/zoned";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { loadProfessionalDay } from "./today";

// The day of the professional's PWA (PRD 11, D-76): their own agenda and nobody else's.

const NOW = new Date("2026-10-21T10:00:00-03:00");
const TODAY = todayIn("America/Fortaleza", NOW);

let fixture: AgendaFixture;

async function book(target: AgendaFixture, professionalId: string, time: string, status: "SCHEDULED" | "CONFIRMED" | "COMPLETED" = "CONFIRMED", patientId = target.patient.id) {
  const startsAt = zonedToUtc(TODAY, time, "America/Fortaleza");
  return target.db.appointment.create({
    data: {
      practiceId: target.practiceId,
      locationId: target.locations.aldeota.id,
      professionalId,
      patientId,
      appointmentTypeId: target.types.consultation.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      durationMinutes: 30,
      priceCents: 45000,
      status,
    },
  });
}

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório do Dia");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("loadProfessionalDay", () => {
  it("is nothing for someone with no professional record", async () => {
    expect(await loadProfessionalDay(await contextAs(fixture, "SECRETARY"), NOW)).toBeNull();
    expect(await loadProfessionalDay(await contextAs(fixture, "PROFESSIONAL"), NOW)).toBeNull();
  });

  it("shows only the own appointments, with the next one and the counts", async () => {
    const target = await createAgendaFixture("Consultório Próprio");
    const context = await contextAs(target, "PROFESSIONAL", { professionalId: target.professionals.ana.id });
    await book(target, target.professionals.ana.id, "08:00", "COMPLETED");
    const next = await book(target, target.professionals.ana.id, "11:00");
    await book(target, target.professionals.ana.id, "14:00", "SCHEDULED");
    await book(target, target.professionals.bruno.id, "11:00");

    const day = (await loadProfessionalDay(context, NOW))!;
    expect(day.professionalName).toBe("Dra. Ana Teste");
    expect(day.appointments).toHaveLength(3);
    expect(day.next).toBe(next.id);
    expect(day.counts).toEqual({ total: 3, confirmed: 2 });
    expect(day.predictedCents).toBe(135000);
  });

  it("offers the professional what the status table allows: marking the arrival, not confirming", async () => {
    const target = await createAgendaFixture("Consultório Transições");
    const context = await contextAs(target, "PROFESSIONAL", { professionalId: target.professionals.ana.id });
    await book(target, target.professionals.ana.id, "11:00", "SCHEDULED");
    const day = (await loadProfessionalDay(context, NOW))!;
    expect(day.appointments[0].next).toEqual(["ARRIVED"]);
  });

  it("gives a manager who attends their own day, not the practice's", async () => {
    const target = await createAgendaFixture("Consultório Gestora");
    const context = await contextAs(target, "PRACTICE_MANAGER", { professionalId: target.professionals.ana.id });
    await book(target, target.professionals.ana.id, "11:00");
    await book(target, target.professionals.bruno.id, "11:00");
    expect((await loadProfessionalDay(context, NOW))!.appointments).toHaveLength(1);
  });

  it("shows the pending Google change of the own agenda only", async () => {
    const target = await createAgendaFixture("Consultório Pendência");
    const context = await contextAs(target, "PROFESSIONAL", { professionalId: target.professionals.ana.id });
    const mine = await book(target, target.professionals.ana.id, "11:00");
    const other = await book(target, target.professionals.bruno.id, "11:00");
    await target.db.pendingGoogleChange.createMany({
      data: [mine, other].map((appointment) => ({ practiceId: target.practiceId, appointmentId: appointment.id, kind: "DELETED" as const })),
    });
    const day = (await loadProfessionalDay(context, NOW))!;
    expect(day.googleChanges.map((change) => change.appointmentId)).toEqual([mine.id]);
  });

  it("never reads another practice", async () => {
    const mine = await createAgendaFixture("Consultório Meu Dia");
    const other = await createAgendaFixture("Consultório Outro Dia");
    await book(other, other.professionals.ana.id, "11:00");
    const context = await contextAs(mine, "PROFESSIONAL", { professionalId: mine.professionals.ana.id });
    expect((await loadProfessionalDay(context, NOW))!.appointments).toHaveLength(0);
  });
});
