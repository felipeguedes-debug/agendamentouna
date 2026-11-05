import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppointment } from "@/lib/appointments/appointments";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { addInstance, createCadence, createPatient, createTypeWithCadence, dayAhead, dispatchesOf, openWindowAllDay } from "../../../tests/helpers/cadence";
import { connectCrm, crmContactOf, crmStateOf } from "../../../tests/helpers/crm";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { applyContactCommands } from "./inbound";
import { CRM_COMMAND_TAGS } from "./rules";
import { putSandboxContact } from "./sandbox";

// The secretary's commands (D-05, D-06, D-08, D-66): a tag on the contact reaches the
// appointment of the latest cadence message sent to that patient, with the status
// changing only through changeAppointmentStatus and the cadence stopping by its table.

let fixture: AgendaFixture;
let secretary: PracticeContext;
let practiceId: string;
let accountId: string;
let typeId: string;
let nextDay = 3;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Comandos");
  practiceId = fixture.practiceId;
  await openWindowAllDay(practiceId);
  await addInstance(practiceId, fixture.professionals.ana.id);
  ({ accountId } = await connectCrm(practiceId));
  const cadence = await createCadence(practiceId, "Comandos", [
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", action: "REQUEST_CONFIRMATION" },
    { anchor: "APPOINTMENT", offsetMinutes: -180, action: "REQUEST_CONFIRMATION" },
    { anchor: "APPOINTMENT", offsetMinutes: -2880, eligibleStatuses: ["SCHEDULED", "CONFIRMED"], action: "REMINDER" },
  ]);
  typeId = (await createTypeWithCadence(practiceId, "Consulta comandos", cadence.id)).id;
  secretary = await contextAs(fixture, "SECRETARY");
});

beforeEach(() => {
  vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

async function book(patientId: string) {
  const { id } = await createAppointment(secretary, {
    patientId,
    professionalId: fixture.professionals.ana.id,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: typeId,
    date: dayAhead(nextDay++),
    time: "10:00",
  });
  return id;
}

/** The appointment's D-1 request went out at `sentAt`. */
async function markRequestSent(appointmentId: string, sentAt = new Date()) {
  const request = (await dispatchesOf(practiceId, appointmentId)).find((row) => row.cadenceStep?.offsetMinutes === -1440)!;
  await fixture.db.dispatch.update({ where: { id: request.id }, data: { status: "SENT", sentAt } });
  return request.id;
}

async function taggedContact(phone: string, ...tags: string[]) {
  return putSandboxContact(practiceId, { name: "Paciente", phone, tags });
}

const statusOf = async (id: string) => (await fixture.db.appointment.findUniqueOrThrow({ where: { id } })).status;
const run = (contactId: string, now?: Date) => applyContactCommands(accountId, { contactId, origin: "webhook", deliveryKey: `test-${contactId}-${Math.random()}` }, { now });

describe("the confirm command", () => {
  it("confirms the appointment of the latest cadence message and asks for the export", async () => {
    const patient = await createPatient(practiceId);
    const appointmentId = await book(patient.id);
    await markRequestSent(appointmentId);
    const contact = await taggedContact(patient.phone!, CRM_COMMAND_TAGS.confirm, "Lead");

    const results = await run(contact.id);

    expect(results).toEqual([{ command: "confirm", outcome: "confirmed", appointmentId }]);
    expect(await statusOf(appointmentId)).toBe("CONFIRMED");
    expect((await crmStateOf(practiceId, appointmentId)).crmSyncRequestedAt).not.toBeNull();
    const after = (await crmContactOf(practiceId, patient.phone!))!;
    expect(after.tagNames).toEqual(["Lead"]);
    const event = await fixture.db.crmInboundEvent.findFirstOrThrow({ where: { appointmentId } });
    expect(event).toMatchObject({ command: "confirm", outcome: "confirmed", origin: "webhook", patientId: patient.id, externalContactId: contact.id });
  });

  it("links the contact to the patient, so later events find it even after a phone change", async () => {
    const patient = await createPatient(practiceId);
    await markRequestSent(await book(patient.id));
    const contact = await taggedContact(patient.phone!, CRM_COMMAND_TAGS.confirm);
    await run(contact.id);
    expect((await fixture.db.patient.findUniqueOrThrow({ where: { id: patient.id } })).crmContactId).toBe(contact.id);
  });

  it("finds the patient with or without the ninth digit", async () => {
    const patient = await createPatient(practiceId, { phone: "+5585987651234" });
    const appointmentId = await book(patient.id);
    await markRequestSent(appointmentId);
    const contact = await taggedContact("+558587651234", CRM_COMMAND_TAGS.confirm);
    await run(contact.id);
    expect(await statusOf(appointmentId)).toBe("CONFIRMED");
  });

  it("goes to the appointment of the latest message when the patient has two (D-08)", async () => {
    const patient = await createPatient(practiceId);
    const older = await book(patient.id);
    const newer = await book(patient.id);
    await markRequestSent(older, new Date(Date.now() - 3_600_000));
    await markRequestSent(newer, new Date());
    const contact = await taggedContact(patient.phone!, CRM_COMMAND_TAGS.confirm);

    await run(contact.id);

    expect(await statusOf(newer)).toBe("CONFIRMED");
    expect(await statusOf(older)).toBe("SCHEDULED");
  });

  it("does nothing when the appointment of the latest message already passed, not even on an older one (D-08)", async () => {
    const patient = await createPatient(practiceId);
    const appointmentId = await book(patient.id);
    await markRequestSent(appointmentId);
    const contact = await taggedContact(patient.phone!, CRM_COMMAND_TAGS.confirm);
    const after = new Date(Date.now() + 90 * 86_400_000);

    expect(await run(contact.id, after)).toEqual([{ command: "confirm", outcome: "appointment_passed", appointmentId }]);

    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
    const updated = (await crmContactOf(practiceId, patient.phone!))!;
    expect(updated.tagNames).toEqual([]);
    expect(updated.notes.at(-1)!.text).toContain("já passou");
  });

  it("does nothing when no cadence message went to the patient, and says so in the conversation (D-08)", async () => {
    const patient = await createPatient(practiceId);
    const appointmentId = await book(patient.id);
    const contact = await taggedContact(patient.phone!, CRM_COMMAND_TAGS.confirm);

    expect(await run(contact.id)).toEqual([{ command: "confirm", outcome: "no_cadence_message", appointmentId: null }]);

    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
    const updated = (await crmContactOf(practiceId, patient.phone!))!;
    expect(updated.tagNames).toEqual([]);
    expect(updated.notes.at(-1)!.text).toContain("nenhuma mensagem de régua");
  });

  it("takes an appointment already confirmed as done", async () => {
    const patient = await createPatient(practiceId);
    const appointmentId = await book(patient.id);
    await markRequestSent(appointmentId);
    await fixture.db.appointment.update({ where: { id: appointmentId }, data: { status: "CONFIRMED" } });
    const contact = await taggedContact(patient.phone!, CRM_COMMAND_TAGS.confirm);

    expect(await run(contact.id)).toEqual([{ command: "confirm", outcome: "already_confirmed", appointmentId }]);
    expect((await crmContactOf(practiceId, patient.phone!))!.tagNames).toEqual([]);
  });

  it("tells a contact that is no patient of the practice", async () => {
    const contact = await taggedContact("+5585911110000", CRM_COMMAND_TAGS.confirm);
    expect(await run(contact.id)).toEqual([{ command: "confirm", outcome: "unknown_contact", appointmentId: null }]);
    const updated = (await crmContactOf(practiceId, "+5585911110000"))!;
    expect(updated.tagNames).toEqual([]);
    expect(updated.notes.at(-1)!.text).toContain("nenhum paciente");
  });

  it("does not reach an erased patient", async () => {
    const patient = await createPatient(practiceId);
    const phone = patient.phone!;
    const contact = await taggedContact(phone, CRM_COMMAND_TAGS.confirm);
    await fixture.db.patient.update({ where: { id: patient.id }, data: { phone: null, anonymizedAt: new Date(), crmContactId: contact.id } });
    expect(await run(contact.id)).toEqual([{ command: "confirm", outcome: "unknown_contact", appointmentId: null }]);
  });

  it("does nothing for a contact without a command", async () => {
    const patient = await createPatient(practiceId);
    const contact = await taggedContact(patient.phone!, "Lead", "Agenda: Confirmado");
    expect(await run(contact.id)).toEqual([]);
    expect(await fixture.db.crmInboundEvent.count({ where: { externalContactId: contact.id } })).toBe(0);
  });

  it("does nothing for a contact the CRM no longer has", async () => {
    expect(await run("6f1d1c8e-1c1b-4c3b-9d9e-000000000456")).toEqual([]);
  });
});

describe("the manual contact command", () => {
  it("ends the confirmation requests and closes the follow-up flags, without changing the status (D-06)", async () => {
    const patient = await createPatient(practiceId);
    const appointmentId = await book(patient.id);
    await markRequestSent(appointmentId);
    await fixture.db.appointmentFlag.create({ data: { practiceId, appointmentId, type: "NO_CONFIRMATION" } });
    const contact = await taggedContact(patient.phone!, CRM_COMMAND_TAGS.manual_contact);

    expect(await run(contact.id)).toEqual([{ command: "manual_contact", outcome: "manual_contact", appointmentId }]);

    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
    const dispatches = await dispatchesOf(practiceId, appointmentId);
    expect(dispatches.find((row) => row.cadenceStep?.offsetMinutes === -180)!.status).toBe("CANCELED");
    expect(dispatches.find((row) => row.cadenceStep?.offsetMinutes === -180)!.statusReason).toBe("manual_contact");
    expect(dispatches.find((row) => row.cadenceStep?.action === "REMINDER")!.status).toBe("SCHEDULED");
    const flags = await fixture.db.appointmentFlag.findMany({ where: { appointmentId } });
    expect(flags.filter((flag) => flag.type === "NO_CONFIRMATION" && flag.resolvedAt === null)).toHaveLength(0);
    expect(flags.filter((flag) => flag.type === "MANUAL_CONTACT")).toHaveLength(1);
    const audit = await fixture.db.auditEvent.findFirstOrThrow({ where: { entityId: appointmentId, action: "appointment.manual_contact" } });
    expect(audit.actorType).toBe("CRM");

    const updated = (await crmContactOf(practiceId, patient.phone!))!;
    expect(updated.tagNames).toEqual([]);
    expect(updated.notes.at(-1)!.text).toContain("contato manual registrado");
  });

  it("keeps the note's id on the appointment, for the erasure to take it back (D-28, D-70)", async () => {
    const patient = await createPatient(practiceId);
    const appointmentId = await book(patient.id);
    await markRequestSent(appointmentId);
    const contact = await taggedContact(patient.phone!, CRM_COMMAND_TAGS.manual_contact);

    await run(contact.id);

    const note = (await crmContactOf(practiceId, patient.phone!))!.notes.at(-1)!;
    expect(note.text).toContain("contato manual registrado");
    expect((await crmStateOf(practiceId, appointmentId)).crmNoteIds).toContain(note.id);
  });

  it("with both commands, confirms first", async () => {
    const patient = await createPatient(practiceId);
    const appointmentId = await book(patient.id);
    await markRequestSent(appointmentId);
    const contact = await taggedContact(patient.phone!, CRM_COMMAND_TAGS.manual_contact, CRM_COMMAND_TAGS.confirm);
    const results = await run(contact.id);
    expect(results.map((result) => result.command)).toEqual(["confirm", "manual_contact"]);
    expect(await statusOf(appointmentId)).toBe("CONFIRMED");
    expect((await crmContactOf(practiceId, patient.phone!))!.tagNames).toEqual([]);
  });
});

describe("what the log keeps", () => {
  it("holds ids and codes, nothing personal", async () => {
    const patient = await createPatient(practiceId, { name: "Nome Sigiloso" });
    await markRequestSent(await book(patient.id));
    const contact = await taggedContact(patient.phone!, CRM_COMMAND_TAGS.confirm);
    await run(contact.id);
    const event = await fixture.db.crmInboundEvent.findFirstOrThrow({ where: { patientId: patient.id } });
    const stored = JSON.stringify(event);
    expect(stored).not.toContain("Sigiloso");
    expect(stored).not.toContain(patient.phone!.slice(1));
    const audit = await fixture.db.auditEvent.findMany({ where: { entityId: patient.id } });
    expect(JSON.stringify(audit)).not.toContain("Sigiloso");
  });
});
