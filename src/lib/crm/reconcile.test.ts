import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppointment } from "@/lib/appointments/appointments";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { addInstance, createCadence, createPatient, createTypeWithCadence, dayAhead, dispatchesOf, openWindowAllDay } from "../../../tests/helpers/cadence";
import { connectCrm, crmAccountOf, crmContactOf, failingCrm } from "../../../tests/helpers/crm";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { exportToCrm } from "./outbound";
import { reconcileNextDay } from "./reconcile";
import { CRM_COMMAND_TAGS } from "./rules";
import { applySandboxTag, SandboxCrmProvider, setSandboxTags } from "./sandbox";

// The daily reconciliation (PRD 10, status divergente): the appointments of the next
// day are compared with the CRM. A command whose webhook got lost is applied, and a
// status tag that differs is written again, without a repeated note (D-69).

let fixture: AgendaFixture;
let secretary: PracticeContext;
let practiceId: string;
let typeId: string;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Reconciliação");
  practiceId = fixture.practiceId;
  await openWindowAllDay(practiceId);
  await addInstance(practiceId, fixture.professionals.ana.id);
  await connectCrm(practiceId);
  const cadence = await createCadence(practiceId, "Reconciliação", [
    { anchor: "APPOINTMENT", offsetMinutes: -60, action: "REQUEST_CONFIRMATION" },
    { anchor: "APPOINTMENT", offsetMinutes: -30, action: "REQUEST_CONFIRMATION" },
  ]);
  typeId = (await createTypeWithCadence(practiceId, "Consulta reconciliação", cadence.id)).id;
  secretary = await contextAs(fixture, "SECRETARY");
});

beforeEach(() => {
  vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

async function exportedBooking(days: number, time: string) {
  const patient = await createPatient(practiceId);
  const { id } = await createAppointment(secretary, {
    patientId: patient.id,
    professionalId: fixture.professionals.ana.id,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: typeId,
    date: dayAhead(days),
    time,
  });
  const first = (await dispatchesOf(practiceId, id))[0];
  await fixture.db.dispatch.update({ where: { id: first.id }, data: { status: "SENT", sentAt: new Date() } });
  await exportToCrm(practiceId);
  return { patient, appointmentId: id, contact: (await crmContactOf(practiceId, patient.phone!))! };
}

const statusOf = async (id: string) => (await fixture.db.appointment.findUniqueOrThrow({ where: { id } })).status;

describe("reconcileNextDay", () => {
  it("applies a confirmation whose webhook got lost, and the cadence stops", async () => {
    const { appointmentId, contact, patient } = await exportedBooking(1, "09:00");
    await applySandboxTag(practiceId, contact.id, CRM_COMMAND_TAGS.confirm);
    // A request still to go, whatever the 4 h limit made of the plan.
    const pending = (await dispatchesOf(practiceId, appointmentId))[1];
    await fixture.db.dispatch.update({ where: { id: pending.id }, data: { status: "SCHEDULED", statusReason: null, scheduledFor: new Date(Date.now() + 3_600_000) } });

    const summary = await reconcileNextDay(practiceId);

    expect(summary.commands).toBeGreaterThanOrEqual(1);
    expect(await statusOf(appointmentId)).toBe("CONFIRMED");
    const dispatches = await dispatchesOf(practiceId, appointmentId);
    expect(dispatches.some((row) => row.status === "CANCELED" && row.statusReason === "confirmed")).toBe(true);
    const event = await fixture.db.crmInboundEvent.findFirstOrThrow({ where: { appointmentId } });
    expect(event.origin).toBe("reconciliation");
    expect((await crmContactOf(practiceId, patient.phone!))!.tagNames).not.toContain(CRM_COMMAND_TAGS.confirm);
  });

  it("writes a status tag that differs again, without repeating the note", async () => {
    const { appointmentId, contact, patient } = await exportedBooking(1, "09:30");
    await setSandboxTags(practiceId, contact.id, ["Agenda: Cancelado"]);
    const notes = contact.notes.length;

    const summary = await reconcileNextDay(practiceId);
    expect(summary.diverged).toBeGreaterThanOrEqual(1);
    await exportToCrm(practiceId);

    const after = (await crmContactOf(practiceId, patient.phone!))!;
    expect(after.tagNames).toEqual(["Agenda: Agendado"]);
    expect(after.notes).toHaveLength(notes);
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
  });

  it("does not take a tag in capitals for a difference, as the API spells them on a contact (D-70)", async () => {
    const { contact } = await exportedBooking(1, "12:00");
    await setSandboxTags(practiceId, contact.id, ["AGENDA: AGENDADO"]);
    const provider = new SandboxCrmProvider(practiceId);
    const updateTags = vi.spyOn(provider, "updateTags");
    await reconcileNextDay(practiceId, { provider });
    await exportToCrm(practiceId, { provider });
    expect(updateTags).not.toHaveBeenCalledWith(expect.objectContaining({ id: contact.id }), expect.anything());
  });

  it("sends an appointment that never reached the CRM", async () => {
    const patient = await createPatient(practiceId);
    const { id } = await createAppointment(secretary, {
      patientId: patient.id,
      professionalId: fixture.professionals.ana.id,
      locationId: fixture.locations.aldeota.id,
      appointmentTypeId: typeId,
      date: dayAhead(1),
      time: "10:00",
    });
    await fixture.db.appointment.update({ where: { id }, data: { crmSyncRequestedAt: null } });

    await reconcileNextDay(practiceId);
    await exportToCrm(practiceId);

    expect((await crmContactOf(practiceId, patient.phone!))!.tagNames).toEqual(["Agenda: Agendado"]);
  });

  it("looks only at the next day, in the location's zone", async () => {
    const later = await exportedBooking(5, "09:00");
    await applySandboxTag(practiceId, later.contact.id, CRM_COMMAND_TAGS.confirm);
    await reconcileNextDay(practiceId);
    expect(await statusOf(later.appointmentId)).toBe("SCHEDULED");
    expect((await crmContactOf(practiceId, later.patient.phone!))!.tagNames).toContain(CRM_COMMAND_TAGS.confirm);
  });

  it("records when it ran", async () => {
    const now = new Date();
    await reconcileNextDay(practiceId, { now });
    expect((await fixture.db.crmConnection.findFirstOrThrow()).reconciledAt?.getTime()).toBe(now.getTime());
  });

  it("with the CRM down, stops without an exception, keeps the agenda and tries tomorrow", async () => {
    const { appointmentId } = await exportedBooking(1, "11:00");
    const before = (await fixture.db.crmConnection.findFirstOrThrow()).reconciledAt;
    const summary = await reconcileNextDay(practiceId, { provider: failingCrm(practiceId, "transient", ["getContact", "findContactByPhone"]) });
    expect(summary.unavailable).toBe(true);
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
    expect((await fixture.db.crmConnection.findFirstOrThrow()).reconciledAt).toEqual(before);
  });

  it("a contact the CRM refuses does not stop the round", async () => {
    await exportedBooking(1, "13:00");
    const summary = await reconcileNextDay(practiceId, { provider: failingCrm(practiceId, "rejected", ["getContact", "findContactByPhone"]) });
    expect(summary.unavailable).toBe(false);
    expect(summary.checked).toBeGreaterThanOrEqual(2);
    expect((await crmAccountOf(practiceId)).status).toBe("ACTIVE");
  });

  it("a refused token marks the connection and stops", async () => {
    const other = await createAgendaFixture("Consultório Reconciliação Revogado");
    await connectCrm(other.practiceId);
    const otherSecretary = await contextAs(other, "SECRETARY");
    await createAppointment(otherSecretary, {
      patientId: other.patient.id,
      professionalId: other.professionals.ana.id,
      locationId: other.locations.aldeota.id,
      appointmentTypeId: other.types.procedure.id,
      date: dayAhead(1),
      time: "10:00",
    });
    const summary = await reconcileNextDay(other.practiceId, { provider: failingCrm(other.practiceId, "auth", ["findContactByPhone"]) });
    expect(summary.unavailable).toBe(true);
    expect((await crmAccountOf(other.practiceId)).status).toBe("REVOKED");
  });

  it("does nothing without a connection", async () => {
    const other = await createAgendaFixture("Consultório sem reconciliação");
    expect(await reconcileNextDay(other.practiceId)).toMatchObject({ checked: 0 });
  });
});
