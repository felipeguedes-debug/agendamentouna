import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { changeAppointmentStatus, createAppointment, rescheduleAppointment } from "@/lib/appointments/appointments";
import type { PracticeContext } from "@/lib/auth/access";
import { forPractice, prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { createPatientQuick, updatePatientPhone } from "@/lib/patients/patients";
import { addInstance, dayAhead } from "../../../tests/helpers/cadence";
import { connectCrm, crmAccountOf, crmContactOf, crmStateOf, failingCrm } from "../../../tests/helpers/crm";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { exportToCrm, EXPORT_MAX_ATTEMPTS } from "./outbound";
import { CRM_EXPORT_EVENT } from "./queue";
import { putSandboxContact, SandboxCrmProvider } from "./sandbox";

// System → SynkronosCRM (PRD 6, D-68): appointments and patients are marked in the
// transaction that changes them and exported afterwards, with new attempts. A CRM
// that is down never stops the agenda.

let fixture: AgendaFixture;
let secretary: PracticeContext;
let manager: PracticeContext;
let db: ReturnType<typeof forPractice>;
let practiceId: string;
let nextDay = 3;
let send: ReturnType<typeof vi.spyOn>;
let phoneCounter = 0;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório CRM");
  practiceId = fixture.practiceId;
  db = fixture.db;
  await connectCrm(practiceId);
  // The note goes to the conversation with the professional's number (D-73).
  await addInstance(practiceId, fixture.professionals.ana.id);
  await addInstance(practiceId, fixture.professionals.bruno.id);
  await db.appointmentType.update({ where: { id: fixture.types.procedure.id }, data: { displayName: "Procedimento" } });
  secretary = await contextAs(fixture, "SECRETARY");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
});

beforeEach(() => {
  send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
  send.mockClear();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

const uniquePhone = () => {
  phoneCounter += 1;
  return `+55859${String(Date.now() % 10_000).padStart(4, "0")}${String(phoneCounter).padStart(4, "0")}`;
};

async function newPatient(name = "Carla Souza") {
  return db.patient.create({ data: { practiceId, name, phone: uniquePhone() } });
}

async function book(patientId: string, options: { typeId?: string; time?: string } = {}) {
  const { id } = await createAppointment(secretary, {
    patientId,
    professionalId: fixture.professionals.ana.id,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: options.typeId ?? fixture.types.procedure.id,
    date: dayAhead(nextDay++),
    time: options.time ?? "10:00",
    internalNote: "Paciente pediu sigilo",
  });
  return id;
}

describe("the export of appointments", () => {
  it("creates the contact, tags it and tells status, type, professional, location and time", async () => {
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    expect((await crmStateOf(practiceId, appointmentId)).crmSyncRequestedAt).not.toBeNull();

    const summary = await exportToCrm(practiceId);

    expect(summary.failed).toBe(0);
    const contact = (await crmContactOf(practiceId, patient.phone!))!;
    expect(contact.name).toBe("Carla Souza");
    expect(contact.tagNames).toEqual(["Agenda: Agendado"]);
    expect(contact.notes).toHaveLength(1);
    const note = contact.notes[0].text;
    expect(note).toContain("Agenda: Agendado");
    expect(note).toContain("Procedimento");
    expect(note).toContain("Dra. Ana Teste");
    expect(note).toContain("Unidade Aldeota");
    expect(note).toMatch(/\d{2}\/\d{2}\/\d{4} às 10:00/);

    expect((await db.patient.findUniqueOrThrow({ where: { id: patient.id } })).crmContactId).toBe(contact.id);
    const state = await crmStateOf(practiceId, appointmentId);
    expect(state.crmSyncRequestedAt).toBeNull();
    expect(state.crmSyncedStatus).toBe("SCHEDULED");
    expect(state.crmNoteIds).toEqual([contact.notes[0].id]);
  });

  it("never sends the internal type name, the internal note or the patient's phone in a note (D-14)", async () => {
    const patient = await newPatient("Bia Lima");
    await book(patient.id);
    await exportToCrm(practiceId);
    const note = (await crmContactOf(practiceId, patient.phone!))!.notes[0].text;
    expect(note).not.toContain("Escleroterapia");
    expect(note).not.toContain("sigilo");
    expect(note).not.toContain(patient.phone!);
    expect(note).not.toContain("Bia");
  });

  it("follows the status: confirmed, attended and no-show get a note and the tag changes", async () => {
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    await exportToCrm(practiceId);

    await changeAppointmentStatus(secretary, { appointmentId, to: "CONFIRMED" });
    await exportToCrm(practiceId);
    let contact = (await crmContactOf(practiceId, patient.phone!))!;
    expect(contact.tagNames).toEqual(["Agenda: Confirmado"]);
    expect(contact.notes.at(-1)!.text).toContain("Agenda: Confirmado");

    await changeAppointmentStatus(secretary, { appointmentId, to: "NO_SHOW" });
    await exportToCrm(practiceId);
    contact = (await crmContactOf(practiceId, patient.phone!))!;
    expect(contact.tagNames).toEqual(["Agenda: Faltou"]);
    expect(contact.notes).toHaveLength(3);

    await changeAppointmentStatus(manager, { appointmentId, to: "COMPLETED", reason: "Chegou atrasada" });
    await exportToCrm(practiceId);
    contact = (await crmContactOf(practiceId, patient.phone!))!;
    expect(contact.tagNames).toEqual(["Agenda: Atendido"]);
    expect(contact.notes.at(-1)!.text).toContain("Agenda: Atendido");
  });

  it("tells a cancellation", async () => {
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    await exportToCrm(practiceId);
    await changeAppointmentStatus(secretary, { appointmentId, to: "CANCELED_BY_PRACTICE" });
    await exportToCrm(practiceId);
    const contact = (await crmContactOf(practiceId, patient.phone!))!;
    expect(contact.tagNames).toEqual(["Agenda: Cancelado"]);
    expect(contact.notes.at(-1)!.text).toContain("Cancelado pelo consultório");
  });

  it("tells a reschedule on both appointments, and the tag shows the new one", async () => {
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    await exportToCrm(practiceId);
    const { id: newId } = await rescheduleAppointment(secretary, { appointmentId, date: dayAhead(nextDay++), time: "15:00" });
    await exportToCrm(practiceId);

    const contact = (await crmContactOf(practiceId, patient.phone!))!;
    expect(contact.tagNames).toEqual(["Agenda: Agendado"]);
    const notes = contact.notes.map((note) => note.text);
    expect(notes.some((text) => text.startsWith("Agenda: Reagendado"))).toBe(true);
    expect(notes.some((text) => text.startsWith("Agenda: Agendado") && text.includes("às 15:00"))).toBe(true);
    expect((await crmStateOf(practiceId, newId)).crmSyncedStatus).toBe("SCHEDULED");
  });

  it("does not mark Chegou and Em atendimento, which the CRM does not show", async () => {
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    await exportToCrm(practiceId);
    await changeAppointmentStatus(secretary, { appointmentId, to: "ARRIVED" });
    expect((await crmStateOf(practiceId, appointmentId)).crmSyncRequestedAt).toBeNull();
  });

  it("does not write the same note twice when the export repeats", async () => {
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    await exportToCrm(practiceId);
    await db.appointment.update({ where: { id: appointmentId }, data: { crmSyncRequestedAt: new Date() } });
    await exportToCrm(practiceId);
    expect((await crmContactOf(practiceId, patient.phone!))!.notes).toHaveLength(1);
  });

  it("keeps the contact's own tags", async () => {
    const patient = await newPatient();
    await putSandboxContact(practiceId, { name: "Carla", phone: patient.phone!, tags: ["Lead", "Agenda: Faltou"] });
    await book(patient.id);
    await exportToCrm(practiceId);
    expect((await crmContactOf(practiceId, patient.phone!))!.tagNames.sort()).toEqual(["Agenda: Agendado", "Lead"]);
  });

  it("shows the next appointment on the tag, whichever was exported last", async () => {
    const patient = await newPatient();
    const soon = await book(patient.id);
    await changeAppointmentStatus(secretary, { appointmentId: soon, to: "CONFIRMED" });
    await book(patient.id);
    await exportToCrm(practiceId);
    expect((await crmContactOf(practiceId, patient.phone!))!.tagNames).toEqual(["Agenda: Confirmado"]);
  });

  it("applies the tag even when the contact has no conversation to take the note", async () => {
    const patient = await newPatient();
    await putSandboxContact(practiceId, { name: "Carla", phone: patient.phone!, hasConversation: false });
    const appointmentId = await book(patient.id);
    const summary = await exportToCrm(practiceId);

    expect(summary.failed).toBe(0);
    const contact = (await crmContactOf(practiceId, patient.phone!))!;
    expect(contact.tagNames).toEqual(["Agenda: Agendado"]);
    expect(contact.notes).toHaveLength(0);
    const state = await crmStateOf(practiceId, appointmentId);
    expect(state.crmSyncRequestedAt).toBeNull();
    expect(state.crmNoteIds).toEqual([]);
  });

  it("does not export a past appointment that was never in the CRM", async () => {
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    await db.appointment.update({
      where: { id: appointmentId },
      data: { startsAt: new Date(Date.now() - 2 * 86_400_000), endsAt: new Date(Date.now() - 2 * 86_400_000 + 1_800_000) },
    });
    await exportToCrm(practiceId);
    expect(await crmContactOf(practiceId, patient.phone!)).toBeNull();
    expect((await crmStateOf(practiceId, appointmentId)).crmSyncRequestedAt).toBeNull();
  });

  it("leaves a patient without a phone out, without failing", async () => {
    const patient = await db.patient.create({ data: { practiceId, name: "Sem celular" } });
    const appointmentId = await book(patient.id);
    const summary = await exportToCrm(practiceId);
    expect(summary.failed).toBe(0);
    expect((await crmStateOf(practiceId, appointmentId)).crmSyncRequestedAt).toBeNull();
  });

  it("asks Inngest after the commit, and a booking that fails marks nothing", async () => {
    const patient = await newPatient();
    const slot = dayAhead(nextDay++);
    const input = { patientId: patient.id, professionalId: fixture.professionals.bruno.id, locationId: fixture.locations.aldeota.id, appointmentTypeId: fixture.types.procedure.id, date: slot, time: "09:00" };
    const { id } = await createAppointment(secretary, input);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: CRM_EXPORT_EVENT, data: expect.objectContaining({ practiceId }) }));
    await exportToCrm(practiceId);

    send.mockClear();
    await expect(createAppointment(secretary, input)).rejects.toThrow();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ name: CRM_EXPORT_EVENT }));
    expect(await db.appointment.count({ where: { patientId: patient.id } })).toBe(1);
    expect((await crmStateOf(practiceId, id)).crmSyncRequestedAt).toBeNull();
  });

  it("books normally when Inngest cannot be reached; the tick exports later", async () => {
    send.mockRejectedValue(new Error("Inngest unreachable"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    warn.mockRestore();
    send.mockResolvedValue({ ids: [] } as never);
    expect((await crmStateOf(practiceId, appointmentId)).crmSyncRequestedAt).not.toBeNull();
    await exportToCrm(practiceId);
    expect((await crmStateOf(practiceId, appointmentId)).crmSyncRequestedAt).toBeNull();
  });
});

describe("the export of patients", () => {
  it("creates the contact of a patient registered in the agenda", async () => {
    const phone = uniquePhone();
    const option = await createPatientQuick(secretary, { name: "Paula Nova", phone });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: CRM_EXPORT_EVENT }));
    await exportToCrm(practiceId);

    const contact = (await crmContactOf(practiceId, phone))!;
    expect(contact.name).toBe("Paula Nova");
    const patient = await db.patient.findUniqueOrThrow({ where: { id: option.id } });
    expect(patient.crmContactId).toBe(contact.id);
    expect(patient.crmSyncRequestedAt).toBeNull();
  });

  it("links to the contact the CRM already has, as it is, instead of creating another", async () => {
    const patient = await newPatient("Maria Lima");
    const existing = await putSandboxContact(practiceId, { name: "Maria 😊", phone: patient.phone! });
    await db.patient.update({ where: { id: patient.id }, data: { crmSyncRequestedAt: new Date() } });
    await exportToCrm(practiceId);

    expect(await prisma.sandboxCrmContact.count({ where: { accountKey: practiceId, phone: patient.phone! } })).toBe(1);
    const contact = (await crmContactOf(practiceId, patient.phone!))!;
    expect(contact.id).toBe(existing.id);
    expect(contact.name).toBe("Maria 😊");
    expect((await db.patient.findUniqueOrThrow({ where: { id: patient.id } })).crmContactId).toBe(existing.id);
  });

  it("finds a contact the WhatsApp registered without the ninth digit", async () => {
    const patient = await newPatient();
    const oldForm = `${patient.phone!.slice(0, 5)}${patient.phone!.slice(6)}`;
    const existing = await putSandboxContact(practiceId, { name: "Antiga", phone: oldForm });
    await db.patient.update({ where: { id: patient.id }, data: { crmSyncRequestedAt: new Date() } });
    await exportToCrm(practiceId);
    expect((await db.patient.findUniqueOrThrow({ where: { id: patient.id } })).crmContactId).toBe(existing.id);
  });

  it("updates the contact when the phone changes", async () => {
    const phone = uniquePhone();
    const option = await createPatientQuick(secretary, { name: "Rita Muda", phone });
    await exportToCrm(practiceId);
    const before = (await crmContactOf(practiceId, phone))!;

    const newPhone = uniquePhone();
    send.mockClear();
    await updatePatientPhone(secretary, { patientId: option.id, phone: newPhone });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: CRM_EXPORT_EVENT }));
    await exportToCrm(practiceId);

    expect(await crmContactOf(practiceId, phone)).toBeNull();
    expect((await crmContactOf(practiceId, newPhone))!.id).toBe(before.id);
  });

  it("links again when the contact was deleted in the CRM", async () => {
    const patient = await newPatient();
    await db.patient.update({ where: { id: patient.id }, data: { crmContactId: "6f1d1c8e-1c1b-4c3b-9d9e-000000000123", crmSyncRequestedAt: new Date() } });
    await exportToCrm(practiceId);
    const contact = (await crmContactOf(practiceId, patient.phone!))!;
    expect((await db.patient.findUniqueOrThrow({ where: { id: patient.id } })).crmContactId).toBe(contact.id);
  });
});

describe("when the CRM fails", () => {
  it("the agenda goes on, and the export tries again after a while until it works", async () => {
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    const now = new Date();
    const down = failingCrm(practiceId, "transient", ["createContact", "findContactByPhone"]);

    const summary = await exportToCrm(practiceId, { provider: down, now });
    expect(summary.waiting).toBeGreaterThan(0);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe("SCHEDULED");
    let state = await crmStateOf(practiceId, appointmentId);
    expect(state.crmSyncRequestedAt).not.toBeNull();
    expect(state.crmSyncAttempts).toBe(1);
    expect(state.crmSyncRetryAt!.getTime()).toBeGreaterThan(now.getTime());

    // Not due yet: nothing is tried.
    const attempts = down.attempts;
    await exportToCrm(practiceId, { provider: down, now: new Date(now.getTime() + 1_000) });
    expect(down.attempts).toBe(attempts);

    await exportToCrm(practiceId, { now: new Date(state.crmSyncRetryAt!.getTime() + 1_000) });
    state = await crmStateOf(practiceId, appointmentId);
    expect(state.crmSyncRequestedAt).toBeNull();
    expect(state.crmSyncAttempts).toBe(0);
    expect(state.crmSyncRetryAt).toBeNull();
    expect((await crmContactOf(practiceId, patient.phone!))!.notes).toHaveLength(1);
  });

  it("gives up after the last attempt and records the error for the screen", async () => {
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    await exportToCrm(practiceId);
    await changeAppointmentStatus(secretary, { appointmentId, to: "CONFIRMED" });
    await db.appointment.update({ where: { id: appointmentId }, data: { crmSyncAttempts: EXPORT_MAX_ATTEMPTS - 1 } });

    const summary = await exportToCrm(practiceId, { provider: failingCrm(practiceId, "transient", ["addNote", "updateTags"]) });

    expect(summary.failed).toBeGreaterThan(0);
    const state = await crmStateOf(practiceId, appointmentId);
    expect(state.crmSyncRequestedAt).toBeNull();
    expect(state.crmSyncError).toBe("transient");
  });

  it("a refused request is not tried again", async () => {
    const patient = await newPatient();
    const appointmentId = await book(patient.id);
    await exportToCrm(practiceId, { provider: failingCrm(practiceId, "rejected", ["createContact"]) });
    const state = await crmStateOf(practiceId, appointmentId);
    expect(state.crmSyncRequestedAt).toBeNull();
    expect(state.crmSyncError).toBe("rejected");
  });

  it("a rate limit stops the run without spending attempts", async () => {
    const first = await newPatient();
    const second = await newPatient();
    const firstId = await book(first.id);
    const secondId = await book(second.id);
    const limited = failingCrm(practiceId, "rate_limited", ["findContactByPhone"]);

    await exportToCrm(practiceId, { provider: limited });

    expect(limited.attempts).toBe(1);
    for (const id of [firstId, secondId]) {
      const state = await crmStateOf(practiceId, id);
      expect(state.crmSyncRequestedAt).not.toBeNull();
      expect(state.crmSyncAttempts).toBe(0);
    }
    await exportToCrm(practiceId);
  });

  it("a refused token marks the connection, keeps the marks, and a new token sends them", async () => {
    const other = await createAgendaFixture("Consultório CRM revogado");
    await connectCrm(other.practiceId);
    const otherSecretary = await contextAs(other, "SECRETARY");
    const { id: appointmentId } = await createAppointment(otherSecretary, {
      patientId: other.patient.id,
      professionalId: other.professionals.ana.id,
      locationId: other.locations.aldeota.id,
      appointmentTypeId: other.types.procedure.id,
      date: dayAhead(5),
      time: "10:00",
    });

    await exportToCrm(other.practiceId, { provider: failingCrm(other.practiceId, "auth", ["findContactByPhone", "createContact"]) });

    const account = await crmAccountOf(other.practiceId);
    expect(account.status).toBe("REVOKED");
    expect(account.lastError).toBeTruthy();
    expect((await crmStateOf(other.practiceId, appointmentId)).crmSyncRequestedAt).not.toBeNull();

    // Revoked: the export waits, without calling anything.
    const spy = failingCrm(other.practiceId, "transient", ["findContactByPhone"]);
    const summary = await exportToCrm(other.practiceId, { provider: spy });
    expect(spy.attempts).toBe(0);
    expect(summary.waiting).toBeGreaterThan(0);

    await prisma.crmAccount.update({ where: { id: account.id }, data: { status: "ACTIVE", lastError: null } });
    await exportToCrm(other.practiceId);
    expect((await crmStateOf(other.practiceId, appointmentId)).crmSyncRequestedAt).toBeNull();
  });
});

describe("a practice without a connection", () => {
  it("marks nothing and asks Inngest for nothing", async () => {
    const other = await createAgendaFixture("Consultório sem CRM");
    const otherSecretary = await contextAs(other, "SECRETARY");
    const { id } = await createAppointment(otherSecretary, {
      patientId: other.patient.id,
      professionalId: other.professionals.ana.id,
      locationId: other.locations.aldeota.id,
      appointmentTypeId: other.types.procedure.id,
      date: dayAhead(6),
      time: "10:00",
    });
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ name: CRM_EXPORT_EVENT }));
    expect((await crmStateOf(other.practiceId, id)).crmSyncRequestedAt).toBeNull();
    await createPatientQuick(otherSecretary, { name: "Sem CRM", phone: uniquePhone() });
    expect(await other.db.patient.count({ where: { crmSyncRequestedAt: { not: null } } })).toBe(0);
  });
});

describe("practice isolation", () => {
  it("writes each practice's patients in its own account, and exports only its own marks", async () => {
    const other = await createAgendaFixture("Consultório CRM isolado");
    await connectCrm(other.practiceId);
    const otherSecretary = await contextAs(other, "SECRETARY");
    // The same phone in two practices: two contacts, one in each account.
    const phone = uniquePhone();
    const mine = await db.patient.create({ data: { practiceId, name: "Ana Aqui", phone } });
    const theirs = await other.db.patient.create({ data: { practiceId: other.practiceId, name: "Ana Ali", phone } });
    await book(mine.id);
    const { id: theirId } = await createAppointment(otherSecretary, {
      patientId: theirs.id,
      professionalId: other.professionals.ana.id,
      locationId: other.locations.aldeota.id,
      appointmentTypeId: other.types.procedure.id,
      date: dayAhead(7),
      time: "10:00",
    });

    await exportToCrm(practiceId);

    expect((await crmContactOf(practiceId, phone))!.name).toBe("Ana Aqui");
    expect(await crmContactOf(other.practiceId, phone)).toBeNull();
    expect((await crmStateOf(other.practiceId, theirId)).crmSyncRequestedAt).not.toBeNull();

    await exportToCrm(other.practiceId);
    expect((await crmContactOf(other.practiceId, phone))!.name).toBe("Ana Ali");
    expect((await crmContactOf(practiceId, phone))!.name).toBe("Ana Aqui");
  });

  it("the sandbox of one practice does not see another's contact", async () => {
    const other = await createAgendaFixture("Consultório CRM isolado 2");
    const phone = uniquePhone();
    const contact = await putSandboxContact(practiceId, { name: "Só aqui", phone });
    expect(await new SandboxCrmProvider(other.practiceId).getContact(contact.id)).toBeNull();
    expect(await new SandboxCrmProvider(other.practiceId).findContactByPhone(phone)).toBeNull();
  });
});
