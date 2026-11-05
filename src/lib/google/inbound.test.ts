import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { changeAppointmentStatus, createAppointment } from "@/lib/appointments/appointments";
import { inngest } from "@/lib/inngest/client";
import { dayAhead } from "../../../tests/helpers/cadence";
import { googleBlocksOf, googleStateOf, linkGoogle, type LinkedGoogle } from "../../../tests/helpers/google";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import type { PracticeContext } from "@/lib/auth/access";
import { refreshCalendarList } from "./connection";
import { syncConnectionCalendars } from "./inbound";
import { runConnectionSync } from "./jobs";
import { exportAppointments } from "./outbound";
import { eventIdFor } from "./rules";
import { addSandboxCalendar, deleteSandboxEvent, moveSandboxEvent, putSandboxEvent } from "./sandbox";

// Google → system (PRD 5; D-10, D-15, D-61, D-63): busy events of the calendars
// that count become "Compromisso Google" blocks; the practice's own secondary
// calendar never does; an event of the system moved or deleted in Google becomes a
// pending change, never a direct change.

vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let fixture: AgendaFixture;
let secretary: PracticeContext;
let linked: LinkedGoogle;
let slot = 0;

/** An instant `days` ahead at a round hour, so blocks are easy to compare. */
function ahead(days: number, hours = 0) {
  const base = new Date(Date.now() + days * DAY + hours * HOUR);
  base.setUTCMinutes(0, 0, 0);
  return base;
}

async function sync(connectionId = linked.connectionId) {
  await syncConnectionCalendars(connectionId);
}

async function bookAndExport() {
  slot += 1;
  const { id } = await createAppointment(secretary, {
    patientId: fixture.patient.id,
    professionalId: fixture.professionals.ana.id,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: fixture.types.consultation.id,
    date: dayAhead(20 + slot),
    time: "10:00",
  });
  await exportAppointments(fixture.practiceId, { appointmentIds: [id] });
  return fixture.db.appointment.findUniqueOrThrow({ where: { id } });
}

async function openChanges(appointmentId: string) {
  return fixture.db.pendingGoogleChange.findMany({ where: { appointmentId, resolvedAt: null } });
}

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Leitura Google");
  secretary = await contextAs(fixture, "SECRETARY");
  linked = await linkGoogle(fixture.practiceId, fixture.professionals.ana.id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("busy events become blocks (D-15)", () => {
  it("copies the time of a busy event, nothing of its content", async () => {
    const eventId = await putSandboxEvent(linked.primaryCalendarId, { start: ahead(1), end: ahead(1, 1), summary: "Biópsia do Sr. Fulano" });
    await sync();
    const block = (await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id)).find((row) => row.googleEventId === eventId);
    expect(block).toMatchObject({ startsAt: ahead(1), endsAt: ahead(1, 1), allDay: false, reason: null, googleCalendarId: linked.primaryCalendarId });
    expect(JSON.stringify(block)).not.toContain("Biópsia");
  });

  it("leaves a free event out, but blocks a free all-day event unless the professional turned that off", async () => {
    const free = await putSandboxEvent(linked.primaryCalendarId, { start: ahead(2), end: ahead(2, 1), transparency: "transparent" });
    const date = dayAhead(4);
    const vacation = await putSandboxEvent(linked.primaryCalendarId, { date, endDate: dayAhead(6), transparency: "transparent" });
    await sync();
    let blocks = await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id);
    expect(blocks.some((row) => row.googleEventId === free)).toBe(false);
    expect(blocks.find((row) => row.googleEventId === vacation)).toMatchObject({ allDay: true });

    await fixture.db.professional.update({ where: { id: fixture.professionals.ana.id }, data: { allDayEventsBlock: false } });
    await sync();
    blocks = await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id);
    expect(blocks.some((row) => row.googleEventId === vacation)).toBe(false);
    await fixture.db.professional.update({ where: { id: fixture.professionals.ana.id }, data: { allDayEventsBlock: true } });
  });

  it("follows the event when it moves and drops the block when it is deleted or leaves the 90-day window", async () => {
    const moved = await putSandboxEvent(linked.primaryCalendarId, { start: ahead(3), end: ahead(3, 1) });
    const deleted = await putSandboxEvent(linked.primaryCalendarId, { start: ahead(3, 2), end: ahead(3, 3) });
    const far = await putSandboxEvent(linked.primaryCalendarId, { start: ahead(3, 4), end: ahead(3, 5) });
    const past = await putSandboxEvent(linked.primaryCalendarId, { start: ahead(3, 6), end: ahead(3, 7) });
    await sync();

    await moveSandboxEvent(linked.primaryCalendarId, moved, { start: ahead(5), end: ahead(5, 2) });
    await deleteSandboxEvent(linked.primaryCalendarId, deleted);
    await moveSandboxEvent(linked.primaryCalendarId, far, { start: ahead(120), end: ahead(120, 1) });
    await moveSandboxEvent(linked.primaryCalendarId, past, { start: ahead(-3), end: ahead(-3, 1) });
    await sync();

    const blocks = await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id);
    expect(blocks.find((row) => row.googleEventId === moved)).toMatchObject({ startsAt: ahead(5), endsAt: ahead(5, 2) });
    expect(blocks.some((row) => [deleted, far, past].includes(row.googleEventId!))).toBe(false);
  });

  it("blocks the whole day of a one-day event", async () => {
    const holiday = await putSandboxEvent(linked.primaryCalendarId, { date: dayAhead(9), transparency: "transparent" });
    await sync();
    const block = (await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id)).find((row) => row.googleEventId === holiday);
    expect(block).toMatchObject({ allDay: true });
    expect(block!.endsAt.getTime() - block!.startsAt.getTime()).toBe(DAY);
  });

  it("ignores declined invitations and working locations", async () => {
    const declined = await putSandboxEvent(linked.primaryCalendarId, { start: ahead(6), end: ahead(6, 1), declined: true });
    const office = await putSandboxEvent(linked.primaryCalendarId, { date: dayAhead(7), endDate: dayAhead(8), eventType: "workingLocation" });
    await sync();
    const blocks = await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id);
    expect(blocks.some((row) => row.googleEventId === declined || row.googleEventId === office)).toBe(false);
  });
});

describe("which calendars count (PRD 5, rule 1; D-15)", () => {
  it("never reads the practice's own secondary calendar back as busy", async () => {
    const appointment = await bookAndExport();
    await sync();
    const blocks = await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id);
    expect(blocks.some((row) => row.googleCalendarId === linked.secondaryCalendarId)).toBe(false);
    expect(blocks.some((row) => row.googleEventId === eventIdFor(appointment.id))).toBe(false);
  });

  it("reads the secondary calendar of the same professional's other practice as busy, in both directions", async () => {
    const other = await createAgendaFixture("Clínica Outra Conta");
    const sameDoctor = await linkGoogle(other.practiceId, other.professionals.ana.id, { email: linked.email });
    expect(sameDoctor.connectionId).toBe(linked.connectionId);
    const otherSecretary = await contextAs(other, "SECRETARY");
    const { id } = await createAppointment(otherSecretary, {
      patientId: other.patient.id,
      professionalId: other.professionals.ana.id,
      locationId: other.locations.aldeota.id,
      appointmentTypeId: other.types.consultation.id,
      date: dayAhead(9),
      time: "15:00",
    });
    await exportAppointments(other.practiceId, { appointmentIds: [id] });
    const shared = await putSandboxEvent(linked.primaryCalendarId, { start: ahead(10), end: ahead(10, 1) });
    await sync();

    // The other practice's appointment is busy time here...
    const here = await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id);
    expect(here.find((row) => row.googleEventId === eventIdFor(id))).toMatchObject({ googleCalendarId: sameDoctor.secondaryCalendarId });
    // ...and the personal event blocks both practices.
    expect(here.some((row) => row.googleEventId === shared)).toBe(true);
    const there = await googleBlocksOf(other.practiceId, other.professionals.ana.id);
    expect(there.some((row) => row.googleEventId === shared)).toBe(true);
    expect(there.some((row) => row.googleCalendarId === sameDoctor.secondaryCalendarId)).toBe(false);
  });

  it("leaves read-only calendars out by default and follows the professional's choice", async () => {
    const holidays = await addSandboxCalendar(linked.subject, { summary: "Feriados no Brasil", accessRole: "reader" });
    const holiday = await putSandboxEvent(holidays, { date: dayAhead(11), endDate: dayAhead(12) });
    await refreshCalendarList(linked.connectionId);
    await sync();
    expect((await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id)).some((row) => row.googleEventId === holiday)).toBe(false);

    await fixture.db.professional.update({
      where: { id: fixture.professionals.ana.id },
      data: { googleBusyCalendarsChosen: true, googleBusyCalendarIds: [holidays] },
    });
    await sync();
    const blocks = await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id);
    expect(blocks.some((row) => row.googleEventId === holiday)).toBe(true);
    // The primary calendar no longer counts: its blocks go.
    expect(blocks.some((row) => row.googleCalendarId === linked.primaryCalendarId)).toBe(false);
    await fixture.db.professional.update({ where: { id: fixture.professionals.ana.id }, data: { googleBusyCalendarsChosen: false, googleBusyCalendarIds: [] } });
  });

  it("counts a calendar created in Google from the connection's next sync (D-60)", async () => {
    const own = await createAgendaFixture("Consultório Calendário Novo");
    const account = await linkGoogle(own.practiceId, own.professionals.ana.id);
    const created = await addSandboxCalendar(account.subject, { summary: "Hospital", accessRole: "owner" });
    const eventId = await putSandboxEvent(created, { start: ahead(2), end: ahead(2, 1) });
    await runConnectionSync(account.connectionId);
    expect((await googleBlocksOf(own.practiceId, own.professionals.ana.id)).some((row) => row.googleEventId === eventId)).toBe(true);
  });

  it("skips calendars read in the last minutes when only the stale ones are asked", async () => {
    await sync();
    const eventId = await putSandboxEvent(linked.primaryCalendarId, { start: ahead(13), end: ahead(13, 1) });
    await syncConnectionCalendars(linked.connectionId, { onlyStale: true });
    expect((await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id)).some((row) => row.googleEventId === eventId)).toBe(false);
    await syncConnectionCalendars(linked.connectionId, { onlyStale: true, now: new Date(Date.now() + 5 * 60_000) });
    expect((await googleBlocksOf(fixture.practiceId, fixture.professionals.ana.id)).some((row) => row.googleEventId === eventId)).toBe(true);
  });

  it("does nothing with a revoked connection", async () => {
    const own = await createAgendaFixture("Consultório Leitura Revogada");
    const revoked = await linkGoogle(own.practiceId, own.professionals.ana.id);
    await prisma.googleConnection.update({ where: { id: revoked.connectionId }, data: { status: "REVOKED" } });
    await putSandboxEvent(revoked.primaryCalendarId, { start: ahead(2), end: ahead(2, 1) });
    await sync(revoked.connectionId);
    expect(await googleBlocksOf(own.practiceId, own.professionals.ana.id)).toEqual([]);
  });
});

describe("changes to the system's events become pending (PRD 5, rule 3; D-10)", () => {
  it("turns an event dragged in Google into a pending move, without touching the appointment", async () => {
    const appointment = await bookAndExport();
    const start = new Date(appointment.startsAt.getTime() + 2 * HOUR);
    await moveSandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id), { start, end: new Date(start.getTime() + 45 * 60_000) });
    await sync();

    const [change] = await openChanges(appointment.id);
    expect(change).toMatchObject({ kind: "MOVED", proposedStartsAt: start, proposedEndsAt: new Date(start.getTime() + 45 * 60_000) });
    expect(await fixture.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).toMatchObject({ startsAt: appointment.startsAt, status: "SCHEDULED" });
    const audit = await fixture.db.auditEvent.findFirst({ where: { action: "google_change.detected", entityId: appointment.id } });
    expect(audit?.actorType).toBe("GOOGLE");

    // Moved again: the same pending change, with the new proposal.
    await moveSandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id), { start: new Date(start.getTime() + HOUR), end: new Date(start.getTime() + 2 * HOUR) });
    await sync();
    const changes = await openChanges(appointment.id);
    expect(changes).toHaveLength(1);
    expect(changes[0].proposedStartsAt).toEqual(new Date(start.getTime() + HOUR));
  });

  it("closes the pending change when the event goes back to the system's time", async () => {
    const appointment = await bookAndExport();
    const event = eventIdFor(appointment.id);
    await moveSandboxEvent(linked.secondaryCalendarId!, event, { start: new Date(appointment.startsAt.getTime() + HOUR), end: new Date(appointment.endsAt.getTime() + HOUR) });
    await sync();
    await moveSandboxEvent(linked.secondaryCalendarId!, event, { start: appointment.startsAt, end: appointment.endsAt });
    await sync();
    expect(await openChanges(appointment.id)).toEqual([]);
    expect(await fixture.db.pendingGoogleChange.findFirst({ where: { appointmentId: appointment.id } })).toMatchObject({ resolution: "SUPERSEDED" });
  });

  it("turns an event deleted in Google into a pending deletion", async () => {
    const appointment = await bookAndExport();
    await deleteSandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id));
    await sync();
    const [change] = await openChanges(appointment.id);
    expect(change).toMatchObject({ kind: "DELETED", proposedStartsAt: null });
    expect((await fixture.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("SCHEDULED");
  });

  it("does not read its own writes, or an appointment waiting for export, as a Google change", async () => {
    const appointment = await bookAndExport();
    await sync();
    expect(await openChanges(appointment.id)).toEqual([]);

    // The system changed the appointment and Google still shows the old event.
    await changeAppointmentStatus(secretary, { appointmentId: appointment.id, to: "CONFIRMED" });
    await moveSandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id), { start: new Date(appointment.startsAt.getTime() + HOUR), end: new Date(appointment.endsAt.getTime() + HOUR) });
    expect((await googleStateOf(fixture.practiceId, appointment.id)).googleSyncRequestedAt).not.toBeNull();
    await sync();
    expect(await openChanges(appointment.id)).toEqual([]);
  });

  it("closes the pending change when the appointment changes in the system", async () => {
    const appointment = await bookAndExport();
    await deleteSandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id));
    await sync();
    expect(await openChanges(appointment.id)).toHaveLength(1);
    await changeAppointmentStatus(secretary, { appointmentId: appointment.id, to: "CANCELED_BY_PRACTICE" });
    expect(await openChanges(appointment.id)).toEqual([]);
    expect(await fixture.db.pendingGoogleChange.findFirst({ where: { appointmentId: appointment.id } })).toMatchObject({ resolution: "SUPERSEDED" });
  });
});
