import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createAppointment } from "@/lib/appointments/appointments";
import { inngest } from "@/lib/inngest/client";
import { dayAhead } from "../../../tests/helpers/cadence";
import { googleStateOf, linkGoogle, type LinkedGoogle } from "../../../tests/helpers/google";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import type { PracticeContext } from "@/lib/auth/access";
import { listGoogleChanges, listGoogleConflicts, resolveGoogleChange } from "./changes";
import { syncConnectionCalendars } from "./inbound";
import { exportAppointments } from "./outbound";
import { eventIdFor } from "./rules";
import { GoogleError } from "./provider";
import { deleteSandboxEvent, moveSandboxEvent, putSandboxEvent, SandboxGoogleProvider, sandboxEvent } from "./sandbox";

// Resolving a change made in Google (PRD 5, rule 3; D-10, D-11, D-63): accept
// reschedules or cancels through the status rules, with Google as the source;
// revert puts the system's version back in Google. The secretary, the manager and
// the professional (own appointments only) resolve.

vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);

const HOUR = 3_600_000;

let fixture: AgendaFixture;
let secretary: PracticeContext;
let manager: PracticeContext;
let ana: PracticeContext;
let bruno: PracticeContext;
let linked: LinkedGoogle;
let slot = 0;

async function bookAndExport(professionalId = fixture.professionals.ana.id, time = "09:00") {
  slot += 1;
  const { id } = await createAppointment(secretary, {
    patientId: fixture.patient.id,
    professionalId,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: fixture.types.consultation.id,
    date: dayAhead(10 + slot),
    time,
  });
  await exportAppointments(fixture.practiceId, { appointmentIds: [id] });
  return fixture.db.appointment.findUniqueOrThrow({ where: { id } });
}

/** Drags the appointment's event in Google by `hours` and reads it back. */
async function dragInGoogle(appointment: { id: string; startsAt: Date; endsAt: Date }, hours: number) {
  await moveSandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id), {
    start: new Date(appointment.startsAt.getTime() + hours * HOUR),
    end: new Date(appointment.endsAt.getTime() + hours * HOUR),
  });
  await syncConnectionCalendars(linked.connectionId);
  return fixture.db.pendingGoogleChange.findFirstOrThrow({ where: { appointmentId: appointment.id, resolvedAt: null } });
}

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Pendências Google");
  secretary = await contextAs(fixture, "SECRETARY");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
  ana = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
  bruno = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.bruno.id });
  linked = await linkGoogle(fixture.practiceId, fixture.professionals.ana.id);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("accepting", () => {
  it("reschedules to the time and duration set in Google, with Google as the source", async () => {
    const appointment = await bookAndExport();
    await moveSandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id), {
      start: new Date(appointment.startsAt.getTime() + 3 * HOUR),
      end: new Date(appointment.startsAt.getTime() + 3 * HOUR + 60 * 60_000),
    });
    await syncConnectionCalendars(linked.connectionId);
    const change = await fixture.db.pendingGoogleChange.findFirstOrThrow({ where: { appointmentId: appointment.id } });

    const { appointmentId } = await resolveGoogleChange(secretary, { changeId: change.id, decision: "accept" });

    const original = await fixture.db.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { statusChanges: true } });
    expect(original.status).toBe("RESCHEDULED");
    expect(original.statusChanges.at(-1)).toMatchObject({ toStatus: "RESCHEDULED", source: "GOOGLE", changedByUserId: secretary.user.id });
    const created = await fixture.db.appointment.findUniqueOrThrow({ where: { id: appointmentId! } });
    expect(created).toMatchObject({ rescheduledFromId: appointment.id, durationMinutes: 60, priceCents: appointment.priceCents });
    expect(created.startsAt).toEqual(new Date(appointment.startsAt.getTime() + 3 * HOUR));
    expect(await fixture.db.pendingGoogleChange.findUniqueOrThrow({ where: { id: change.id } })).toMatchObject({
      resolution: "ACCEPTED",
      resolvedByUserId: secretary.user.id,
    });
    // The new appointment gets its event; the old one's goes.
    expect((await googleStateOf(fixture.practiceId, created.id)).googleSyncRequestedAt).not.toBeNull();
    await exportAppointments(fixture.practiceId);
    expect((await sandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id)))?.status).toBe("cancelled");
    expect((await sandboxEvent(linked.secondaryCalendarId!, eventIdFor(created.id)))?.startsAt).toEqual(created.startsAt);
  });

  it("refuses a move over another appointment, which only the manager may overbook", async () => {
    const taken = await bookAndExport(fixture.professionals.ana.id, "14:00");
    const appointment = await fixture.db.appointment.findUniqueOrThrow({
      where: {
        id: (
          await createAppointment(secretary, {
            patientId: fixture.patient.id,
            professionalId: fixture.professionals.ana.id,
            locationId: fixture.locations.aldeota.id,
            appointmentTypeId: fixture.types.consultation.id,
            date: dayAhead(10 + slot),
            time: "12:00",
          })
        ).id,
      },
    });
    await exportAppointments(fixture.practiceId, { appointmentIds: [appointment.id] });
    const change = await dragInGoogle(appointment, 2);
    expect(change.proposedStartsAt).toEqual(taken.startsAt);

    await expect(resolveGoogleChange(secretary, { changeId: change.id, decision: "accept" })).rejects.toThrow(expect.objectContaining({ code: "conflict" }));
    await expect(resolveGoogleChange(secretary, { changeId: change.id, decision: "accept", allowConflict: true })).rejects.toThrow(
      expect.objectContaining({ code: "not_allowed" }),
    );
    await expect(resolveGoogleChange(manager, { changeId: change.id, decision: "accept", allowConflict: true })).resolves.toMatchObject({ overbooked: true });
  });

  it("cancels an appointment whose event was deleted in Google, as canceled by the practice", async () => {
    const appointment = await bookAndExport();
    await deleteSandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id));
    await syncConnectionCalendars(linked.connectionId);
    const change = await fixture.db.pendingGoogleChange.findFirstOrThrow({ where: { appointmentId: appointment.id } });

    await resolveGoogleChange(ana, { changeId: change.id, decision: "accept" });

    const canceled = await fixture.db.appointment.findUniqueOrThrow({ where: { id: appointment.id }, include: { statusChanges: true } });
    expect(canceled.status).toBe("CANCELED_BY_PRACTICE");
    expect(canceled.statusChanges.at(-1)).toMatchObject({ source: "GOOGLE", changedByUserId: ana.user.id });
  });
});

describe("reverting", () => {
  it("puts the appointment's time back in Google", async () => {
    const appointment = await bookAndExport();
    const change = await dragInGoogle(appointment, 1);
    await resolveGoogleChange(manager, { changeId: change.id, decision: "revert" });

    expect(await fixture.db.pendingGoogleChange.findUniqueOrThrow({ where: { id: change.id } })).toMatchObject({ resolution: "REVERTED" });
    expect((await fixture.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).startsAt).toEqual(appointment.startsAt);
    await exportAppointments(fixture.practiceId);
    expect((await sandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id)))?.startsAt).toEqual(appointment.startsAt);
    // The restored event is the system's own write: no new pending change.
    await syncConnectionCalendars(linked.connectionId);
    expect(await fixture.db.pendingGoogleChange.count({ where: { appointmentId: appointment.id, resolvedAt: null } })).toBe(0);
  });

  it("brings a deleted event back under a new id when Google will not restore it", async () => {
    const appointment = await bookAndExport();
    await deleteSandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id));
    await syncConnectionCalendars(linked.connectionId);
    const change = await fixture.db.pendingGoogleChange.findFirstOrThrow({ where: { appointmentId: appointment.id } });
    await resolveGoogleChange(secretary, { changeId: change.id, decision: "revert" });
    // A Google that answers 404 to a patch of a deleted event and 409 to a new insert with its id.
    class NoRestore extends SandboxGoogleProvider {
      override calendar(accessToken: string) {
        const api = super.calendar(accessToken);
        const patchEvent = api.patchEvent.bind(api);
        api.patchEvent = async (calendarId, eventId, input) => {
          if ((await sandboxEvent(calendarId, eventId))?.status === "cancelled") throw new GoogleError("not_found", "Gone");
          return patchEvent(calendarId, eventId, input);
        };
        return api;
      }
    }
    await exportAppointments(fixture.practiceId, { provider: new NoRestore() });

    const { googleEventId } = await fixture.db.appointment.findUniqueOrThrow({ where: { id: appointment.id }, select: { googleEventId: true } });
    expect(googleEventId).not.toBe(eventIdFor(appointment.id));
    expect(googleEventId).toMatch(/^[0-9a-v]+$/);
    expect((await sandboxEvent(linked.secondaryCalendarId!, googleEventId!))).toMatchObject({ status: "confirmed", appointmentId: appointment.id });
    expect(await fixture.db.googleSecondaryCalendar.count({ where: { professionalId: fixture.professionals.ana.id } })).toBe(1);
  });

  it("creates the deleted event again", async () => {
    const appointment = await bookAndExport();
    await deleteSandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id));
    await syncConnectionCalendars(linked.connectionId);
    const change = await fixture.db.pendingGoogleChange.findFirstOrThrow({ where: { appointmentId: appointment.id } });
    await resolveGoogleChange(secretary, { changeId: change.id, decision: "revert" });
    await exportAppointments(fixture.practiceId);
    expect((await sandboxEvent(linked.secondaryCalendarId!, eventIdFor(appointment.id)))?.status).toBe("confirmed");
  });
});

describe("who resolves (D-10)", () => {
  it("lets the professional resolve only their own appointments", async () => {
    const appointment = await bookAndExport();
    const change = await dragInGoogle(appointment, 1);
    await expect(resolveGoogleChange(bruno, { changeId: change.id, decision: "revert" })).rejects.toThrow(expect.objectContaining({ code: "not_found" }));
    expect((await listGoogleChanges(bruno)).some((item) => item.id === change.id)).toBe(false);
    expect((await listGoogleChanges(ana)).some((item) => item.id === change.id)).toBe(true);
    expect((await listGoogleChanges(secretary)).find((item) => item.id === change.id)).toMatchObject({
      kind: "MOVED",
      appointmentId: appointment.id,
      patientName: "Maria Souza",
      professionalName: "Dra. Ana Teste",
    });
    await resolveGoogleChange(ana, { changeId: change.id, decision: "revert" });
  });

  it("refuses a change already resolved", async () => {
    const appointment = await bookAndExport();
    const change = await dragInGoogle(appointment, 1);
    await resolveGoogleChange(secretary, { changeId: change.id, decision: "revert" });
    await expect(resolveGoogleChange(secretary, { changeId: change.id, decision: "accept" })).rejects.toThrow(expect.objectContaining({ code: "already_resolved" }));
  });
});

describe("conflicts with Google (PRD 5, rule 4)", () => {
  it("lists a Google event over an appointment, without canceling anything", async () => {
    const appointment = await bookAndExport();
    await putSandboxEvent(linked.primaryCalendarId, { start: appointment.startsAt, end: appointment.endsAt });
    await syncConnectionCalendars(linked.connectionId);
    const conflicts = await listGoogleConflicts(secretary);
    expect(conflicts.find((item) => item.appointmentId === appointment.id)).toMatchObject({ professionalName: "Dra. Ana Teste", patientName: "Maria Souza" });
    expect((await fixture.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("SCHEDULED");
    expect((await listGoogleConflicts(bruno)).some((item) => item.appointmentId === appointment.id)).toBe(false);
  });
});
