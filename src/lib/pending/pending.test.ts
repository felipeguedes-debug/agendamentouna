import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture } from "../../../tests/helpers/practice";
import { countPending, loadPending } from "./pending";

// Pendências (D-84): one list with the cadence's work list, Google and Sem baixa.

const NOW = new Date("2026-11-10T12:00:00Z");

async function appointment(fixture: Awaited<ReturnType<typeof createAgendaFixture>>, startsAt: string, status: "SCHEDULED" | "CONFIRMED" = "SCHEDULED") {
  const start = new Date(startsAt);
  return fixture.db.appointment.create({
    data: {
      practiceId: fixture.practiceId,
      patientId: fixture.patient.id,
      professionalId: fixture.professionals.ana.id,
      locationId: fixture.locations.aldeota.id,
      appointmentTypeId: fixture.types.consultation.id,
      startsAt: start,
      endsAt: new Date(start.getTime() + 30 * 60_000),
      durationMinutes: 30,
      priceCents: 45000,
      status,
    },
  });
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe("loadPending", () => {
  it("brings the unconfirmed, the answers, the Google rows and those without closing, for the office", async () => {
    const fixture = await createAgendaFixture("Consultório Pendências Lista");
    const { db, practiceId } = fixture;
    const unconfirmed = await appointment(fixture, "2026-11-11T13:00:00Z");
    await db.appointmentFlag.create({ data: { practiceId, appointmentId: unconfirmed.id, type: "NO_CONFIRMATION" } });
    const asked = await appointment(fixture, "2026-11-11T15:00:00Z");
    await db.appointmentFlag.create({ data: { practiceId, appointmentId: asked.id, type: "RESCHEDULE_REQUESTED" } });
    const replied = await appointment(fixture, "2026-11-11T17:00:00Z");
    await db.appointmentFlag.create({ data: { practiceId, appointmentId: replied.id, type: "REPLIED_WITHOUT_CONFIRMING" } });
    const moved = await appointment(fixture, "2026-11-12T13:00:00Z");
    await db.pendingGoogleChange.create({
      data: { practiceId, appointmentId: moved.id, kind: "MOVED", proposedStartsAt: new Date("2026-11-12T15:00:00Z"), proposedEndsAt: new Date("2026-11-12T15:30:00Z") },
    });
    const covered = await appointment(fixture, "2026-11-13T13:00:00Z");
    await db.timeBlock.create({
      data: { practiceId, professionalId: fixture.professionals.ana.id, startsAt: new Date("2026-11-13T12:00:00Z"), endsAt: new Date("2026-11-13T14:00:00Z"), source: "GOOGLE", googleCalendarId: "c", googleEventId: "e" },
    });
    const past = await appointment(fixture, "2026-11-09T13:00:00Z", "CONFIRMED");

    const secretary = await contextAs(fixture, "SECRETARY");
    const rows = await loadPending(secretary, NOW);
    const reasonOf = (id: string) => rows.filter((row) => row.appointmentId === id).map((row) => row.reason);
    expect(reasonOf(unconfirmed.id)).toEqual(["unconfirmed"]);
    expect(reasonOf(asked.id)).toEqual(["reschedule_requested"]);
    expect(reasonOf(replied.id)).toEqual(["replied"]);
    expect(reasonOf(moved.id)).toEqual(["google_change"]);
    expect(reasonOf(covered.id)).toEqual(["google_conflict"]);
    expect(reasonOf(past.id)).toEqual(["without_closing"]);
    expect(await countPending(secretary, NOW)).toBe(rows.length);
  });

  it("shows the professional only the Google rows of the own agenda", async () => {
    const fixture = await createAgendaFixture("Consultório Pendências Profissional");
    const { db, practiceId } = fixture;
    const own = await appointment(fixture, "2026-11-12T13:00:00Z");
    await db.pendingGoogleChange.create({ data: { practiceId, appointmentId: own.id, kind: "DELETED" } });
    const unconfirmed = await appointment(fixture, "2026-11-11T13:00:00Z");
    await db.appointmentFlag.create({ data: { practiceId, appointmentId: unconfirmed.id, type: "NO_CONFIRMATION" } });
    await appointment(fixture, "2026-11-09T13:00:00Z", "CONFIRMED");

    const professional = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
    expect((await loadPending(professional, NOW)).map((row) => row.reason)).toEqual(["google_change"]);

    const other = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.bruno.id });
    expect(await loadPending(other, NOW)).toEqual([]);
  });
});
