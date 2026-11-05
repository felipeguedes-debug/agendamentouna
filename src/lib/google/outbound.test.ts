import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { changeAppointmentStatus, createAppointment, importAppointment, rescheduleAppointment } from "@/lib/appointments/appointments";
import { inngest } from "@/lib/inngest/client";
import { erasePatient } from "@/lib/patients/data-requests";
import { dayAhead } from "../../../tests/helpers/cadence";
import { failingProvider, googleStateOf, linkGoogle } from "../../../tests/helpers/google";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import type { PracticeContext } from "@/lib/auth/access";
import { ensureSecondaryCalendars } from "./connection";
import { EXPORT_MAX_ATTEMPTS, exportAppointments, requestGoogleSync } from "./outbound";
import { eventIdFor } from "./rules";
import { sandboxCalendarsOf, sandboxEvent } from "./sandbox";

// Export to the professional's secondary calendar (PRD 5, Fluxo de dados; D-14,
// D-18, D-28, D-62): every booking, status change and rescheduling marks the
// appointment, and the export writes the event with the first name, the type's
// display name and the status, never the internal note or the phone.

const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);

let fixture: AgendaFixture;
let secretary: PracticeContext;
let secondaryCalendarId: string;
let subject: string;
let connectionId: string;
let slot = 0;

/** A distinct future slot, so bookings never conflict. */
function nextSlot() {
  slot += 1;
  return { date: dayAhead(3 + Math.floor(slot / 8)), time: `${String(8 + (slot % 8)).padStart(2, "0")}:00` };
}

async function book(context = secretary, professionalId = fixture.professionals.ana.id, extra: { internalNote?: string } = {}) {
  return createAppointment(context, {
    patientId: fixture.patient.id,
    professionalId,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: fixture.types.consultation.id,
    ...nextSlot(),
    ...extra,
  });
}

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Exportação Google");
  secretary = await contextAs(fixture, "SECRETARY");
  const linked = await linkGoogle(fixture.practiceId, fixture.professionals.ana.id);
  secondaryCalendarId = linked.secondaryCalendarId!;
  subject = linked.subject;
  connectionId = linked.connectionId;
});

beforeEach(() => {
  send.mockClear();
});

afterAll(async () => {
  send.mockRestore();
  await prisma.$disconnect();
});

describe("secondary calendar (PRD 5, Vínculo)", () => {
  it("is created in the professional's Google, named after the practice", async () => {
    const calendars = await sandboxCalendarsOf(subject);
    expect(calendars.find((calendar) => calendar.calendarId === secondaryCalendarId)).toMatchObject({ summary: "Consultório Exportação Google", accessRole: "owner" });
    const row = await fixture.db.googleSecondaryCalendar.findFirstOrThrow({ where: { professionalId: fixture.professionals.ana.id } });
    expect(row.googleConnectionId).toBe(connectionId);
  });

  it("is created once", async () => {
    await ensureSecondaryCalendars(connectionId);
    expect(await fixture.db.googleSecondaryCalendar.count({ where: { professionalId: fixture.professionals.ana.id } })).toBe(1);
  });
});

describe("marking for export", () => {
  it("marks a booking of a linked professional and asks Inngest to export it", async () => {
    const { id } = await book();
    expect((await googleStateOf(fixture.practiceId, id)).googleSyncRequestedAt).not.toBeNull();
    expect(send).toHaveBeenCalledWith({ name: "google/appointments.export", data: { practiceId: fixture.practiceId, appointmentIds: [id] } });
  });

  it("leaves a professional without Google alone", async () => {
    const { id } = await book(secretary, fixture.professionals.bruno.id);
    expect((await googleStateOf(fixture.practiceId, id)).googleSyncRequestedAt).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not fail the booking when Inngest is unreachable", async () => {
    send.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(book()).resolves.toMatchObject({ overbooked: false });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("asks nothing for appointments that are not marked", async () => {
    await requestGoogleSync(fixture.practiceId, []);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("export", () => {
  it("writes the event in the secondary calendar without the internal note or the phone", async () => {
    const { id } = await book(secretary, fixture.professionals.ana.id, { internalNote: "Paciente ansiosa, diabética" });
    await exportAppointments(fixture.practiceId, { appointmentIds: [id] });

    const state = await googleStateOf(fixture.practiceId, id);
    expect(state.googleEventId).toBe(eventIdFor(id));
    expect(state.googleSyncRequestedAt).toBeNull();
    expect(state.googleSyncedAt).not.toBeNull();
    expect(state.googleEventUpdatedAt).not.toBeNull();
    const event = await sandboxEvent(secondaryCalendarId, eventIdFor(id));
    expect(event).toMatchObject({ summary: "Maria · Consulta (Agendado)", location: "Av. Teste, 100", status: "confirmed", appointmentId: id });
    const appointment = await fixture.db.appointment.findUniqueOrThrow({ where: { id } });
    expect(event?.startsAt).toEqual(appointment.startsAt);
    expect(event?.endsAt).toEqual(appointment.endsAt);
    expect(event?.description).toContain(`/agendamentos/${id}`);
    expect(JSON.stringify(event)).not.toMatch(/ansiosa|diab|Souza|8599812/);
  });

  it("puts the new status in the title and deletes the event when the appointment is canceled", async () => {
    const { id } = await book();
    await exportAppointments(fixture.practiceId, { appointmentIds: [id] });
    await changeAppointmentStatus(secretary, { appointmentId: id, to: "CONFIRMED" });
    expect((await googleStateOf(fixture.practiceId, id)).googleSyncRequestedAt).not.toBeNull();
    await exportAppointments(fixture.practiceId, { appointmentIds: [id] });
    expect((await sandboxEvent(secondaryCalendarId, eventIdFor(id)))?.summary).toBe("Maria · Consulta (Confirmado)");

    await changeAppointmentStatus(secretary, { appointmentId: id, to: "CANCELED_BY_PATIENT" });
    await exportAppointments(fixture.practiceId, { appointmentIds: [id] });
    expect((await sandboxEvent(secondaryCalendarId, eventIdFor(id)))?.status).toBe("cancelled");
    expect((await googleStateOf(fixture.practiceId, id)).googleEventId).toBeNull();
  });

  it("moves the event to the new appointment when rescheduling (D-11)", async () => {
    const { id } = await book();
    await exportAppointments(fixture.practiceId, { appointmentIds: [id] });
    const { id: newId } = await rescheduleAppointment(secretary, { appointmentId: id, ...nextSlot() });
    expect(send).toHaveBeenLastCalledWith({ name: "google/appointments.export", data: { practiceId: fixture.practiceId, appointmentIds: [id, newId] } });
    await exportAppointments(fixture.practiceId);
    expect((await sandboxEvent(secondaryCalendarId, eventIdFor(id)))?.status).toBe("cancelled");
    expect((await sandboxEvent(secondaryCalendarId, eventIdFor(newId)))?.status).toBe("confirmed");
  });

  it("recovers an event written before a crash, without a duplicate", async () => {
    const { id } = await book();
    await exportAppointments(fixture.practiceId, { appointmentIds: [id] });
    // The event exists in Google, but the system lost its id.
    await fixture.db.appointment.update({ where: { id }, data: { googleEventId: null, googleSyncRequestedAt: new Date() } });
    await exportAppointments(fixture.practiceId, { appointmentIds: [id] });
    expect((await googleStateOf(fixture.practiceId, id)).googleEventId).toBe(eventIdFor(id));
    expect(await prisma.sandboxGoogleEvent.count({ where: { calendarId: secondaryCalendarId, appointmentId: id } })).toBe(1);
  });

  it("exports nothing twice", async () => {
    const { id } = await book();
    await exportAppointments(fixture.practiceId, { appointmentIds: [id] });
    const provider = failingProvider("rejected", ["insertEvent", "patchEvent", "deleteEvent"]);
    await exportAppointments(fixture.practiceId, { appointmentIds: [id], provider });
    expect(provider.attempts).toBe(0);
  });
});

describe("first sync and imported appointments (D-15, D-18)", () => {
  it("exports the future appointments, imported ones included, and not the past ones", async () => {
    const own = await createAgendaFixture("Consultório Primeira Exportação");
    const ownManager = await contextAs(own, "PRACTICE_MANAGER");
    const future = await importAppointment(ownManager, {
      patientId: own.patient.id,
      professionalId: own.professionals.ana.id,
      locationId: own.locations.aldeota.id,
      appointmentTypeId: own.types.consultation.id,
      date: dayAhead(5),
      time: "09:00",
      status: "CONFIRMED",
    });
    const past = await importAppointment(ownManager, {
      patientId: own.patient.id,
      professionalId: own.professionals.ana.id,
      locationId: own.locations.aldeota.id,
      appointmentTypeId: own.types.consultation.id,
      date: dayAhead(-5),
      time: "09:00",
      status: "COMPLETED",
    });
    const linked = await linkGoogle(own.practiceId, own.professionals.ana.id);
    expect((await googleStateOf(own.practiceId, future.id)).googleSyncRequestedAt).not.toBeNull();
    expect((await googleStateOf(own.practiceId, past.id)).googleSyncRequestedAt).toBeNull();

    await exportAppointments(own.practiceId);
    expect((await sandboxEvent(linked.secondaryCalendarId!, eventIdFor(future.id)))?.summary).toBe("Maria · Consulta (Confirmado)");
    expect(await sandboxEvent(linked.secondaryCalendarId!, eventIdFor(past.id))).toBeNull();
  });
});

describe("erasure of the data subject (D-28, D-49)", () => {
  it("takes the first name out of the patient's events", async () => {
    const own = await createAgendaFixture("Consultório Exclusão Google");
    const linked = await linkGoogle(own.practiceId, own.professionals.ana.id);
    const ownSecretary = await contextAs(own, "SECRETARY");
    const ownManager = await contextAs(own, "PRACTICE_MANAGER");
    const { id } = await createAppointment(ownSecretary, {
      patientId: own.patient.id,
      professionalId: own.professionals.ana.id,
      locationId: own.locations.aldeota.id,
      appointmentTypeId: own.types.consultation.id,
      date: dayAhead(2),
      time: "10:00",
    });
    await changeAppointmentStatus(ownSecretary, { appointmentId: id, to: "ARRIVED" });
    await changeAppointmentStatus(ownSecretary, { appointmentId: id, to: "COMPLETED" });
    await exportAppointments(own.practiceId);
    expect((await sandboxEvent(linked.secondaryCalendarId!, eventIdFor(id)))?.summary).toBe("Maria · Consulta (Atendido)");

    await erasePatient(ownManager, { patientId: own.patient.id, confirmation: "EXCLUIR" });
    expect((await googleStateOf(own.practiceId, id)).googleSyncRequestedAt).not.toBeNull();
    await exportAppointments(own.practiceId);
    expect((await sandboxEvent(linked.secondaryCalendarId!, eventIdFor(id)))?.summary).toBe("Consulta (Atendido)");
  });
});

describe("failures (PRD 5, rule 6)", () => {
  it("marks the connection revoked when Google refuses the token, and the agenda keeps working", async () => {
    const own = await createAgendaFixture("Consultório Token Revogado");
    const linked = await linkGoogle(own.practiceId, own.professionals.ana.id);
    const ownSecretary = await contextAs(own, "SECRETARY");
    await prisma.googleConnection.update({ where: { id: linked.connectionId }, data: { accessTokenEncrypted: null, accessTokenExpiresAt: null } });
    const { id } = await createAppointment(ownSecretary, {
      patientId: own.patient.id,
      professionalId: own.professionals.ana.id,
      locationId: own.locations.aldeota.id,
      appointmentTypeId: own.types.consultation.id,
      date: dayAhead(2),
      time: "11:00",
    });
    await exportAppointments(own.practiceId, { provider: failingProvider("auth", ["refreshAccessToken"]) });

    const connection = await prisma.googleConnection.findUniqueOrThrow({ where: { id: linked.connectionId } });
    expect(connection.status).toBe("REVOKED");
    expect(connection.lastError).toBeTruthy();
    // Kept for when the professional links again.
    expect((await googleStateOf(own.practiceId, id)).googleSyncRequestedAt).not.toBeNull();
    await expect(changeAppointmentStatus(ownSecretary, { appointmentId: id, to: "CONFIRMED" })).resolves.toBeUndefined();
  });

  it("tries a transient failure again and gives up after the last attempt", async () => {
    const { id } = await book();
    const provider = failingProvider("transient", ["insertEvent", "patchEvent"]);
    for (let attempt = 1; attempt < EXPORT_MAX_ATTEMPTS; attempt += 1) {
      await exportAppointments(fixture.practiceId, { appointmentIds: [id], provider });
      const state = await googleStateOf(fixture.practiceId, id);
      expect(state.googleSyncAttempts).toBe(attempt);
      expect(state.googleSyncRequestedAt).not.toBeNull();
    }
    await exportAppointments(fixture.practiceId, { appointmentIds: [id], provider });
    const state = await googleStateOf(fixture.practiceId, id);
    expect(state.googleSyncRequestedAt).toBeNull();
    expect(state.googleSyncError).toBe("transient");
  });

  it("creates the secondary calendar again when the professional deleted it in Google", async () => {
    const own = await createAgendaFixture("Consultório Calendário Apagado");
    const linked = await linkGoogle(own.practiceId, own.professionals.ana.id);
    const ownSecretary = await contextAs(own, "SECRETARY");
    const { id } = await createAppointment(ownSecretary, {
      patientId: own.patient.id,
      professionalId: own.professionals.ana.id,
      locationId: own.locations.aldeota.id,
      appointmentTypeId: own.types.consultation.id,
      date: dayAhead(4),
      time: "10:00",
    });
    await exportAppointments(own.practiceId);
    await prisma.sandboxGoogleCalendar.delete({ where: { calendarId: linked.secondaryCalendarId! } });

    await changeAppointmentStatus(ownSecretary, { appointmentId: id, to: "CONFIRMED" });
    await exportAppointments(own.practiceId);
    expect(await own.db.googleSecondaryCalendar.count()).toBe(0);
    await ensureSecondaryCalendars(linked.connectionId);
    await exportAppointments(own.practiceId);
    const secondary = await own.db.googleSecondaryCalendar.findFirstOrThrow();
    expect(secondary.googleCalendarId).not.toBe(linked.secondaryCalendarId);
    expect((await sandboxEvent(secondary.googleCalendarId, eventIdFor(id)))?.summary).toBe("Maria · Consulta (Confirmado)");
  });
});
