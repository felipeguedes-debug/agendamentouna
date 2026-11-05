import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { changeAppointmentStatus, createAppointment } from "@/lib/appointments/appointments";
import { exportToCrm } from "@/lib/crm/outbound";
import { applySandboxTag } from "@/lib/crm/sandbox";
import { inngest } from "@/lib/inngest/client";
import { addInstance, dayAhead } from "../../../tests/helpers/cadence";
import { connectCrm, crmContactOf, failingCrm } from "../../../tests/helpers/crm";
import { erasePatient, exportPatientData } from "./data-requests";
import { searchPatients } from "./patients";

// The data subject's requests (PRD 7 LGPD; D-28, D-49): export of everything the
// practice holds about the patient, and erasure by pseudonymization, which keeps
// the appointments and the audit trail without personal data.

let fixture: AgendaFixture;
let other: AgendaFixture;
let manager: PracticeContext;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Titular");
  other = await createAgendaFixture("Consultório Titular Outro");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A patient with a completed and a canceled appointment, consent, history reasons and a dispatch. */
async function patientWithHistory(name: string, phone: string) {
  const { db, practiceId } = fixture;
  const patient = await db.patient.create({ data: { practiceId, name, phone, insurance: "Unimed", notes: "Prefere manhã" } });
  const book = (startsAt: string, status: "COMPLETED" | "CANCELED_BY_PATIENT", professionalId: string) =>
    db.appointment.create({
      data: {
        practiceId,
        locationId: fixture.locations.aldeota.id,
        professionalId,
        patientId: patient.id,
        appointmentTypeId: fixture.types.consultation.id,
        startsAt: new Date(startsAt),
        endsAt: new Date(new Date(startsAt).getTime() + 30 * 60_000),
        durationMinutes: 30,
        priceCents: 45000,
        status,
        insurance: "Unimed",
        internalNote: "Alergia a dipirona",
        leadSource: "INSTAGRAM",
      },
    });
  const completed = await book("2026-03-10T12:00:00Z", "COMPLETED", fixture.professionals.ana.id);
  const canceled = await book("2026-04-10T12:00:00Z", "CANCELED_BY_PATIENT", fixture.professionals.bruno.id);
  await db.appointmentStatusChange.createMany({
    data: [
      { practiceId, appointmentId: completed.id, toStatus: "SCHEDULED", source: "USER" },
      { practiceId, appointmentId: canceled.id, toStatus: "SCHEDULED", source: "USER" },
      { practiceId, appointmentId: canceled.id, fromStatus: "SCHEDULED", toStatus: "CANCELED_BY_PATIENT", source: "USER", reason: "Ligou dizendo que está internada" },
    ],
  });
  const instance = await db.whatsappInstance.findFirst({ where: { professionalId: fixture.professionals.ana.id } })
    ?? (await db.whatsappInstance.create({ data: { practiceId, professionalId: fixture.professionals.ana.id, providerInstanceId: "erasure", apiUrl: "https://whatsapi.test", tokenEncrypted: "test" } }));
  const dispatch = await db.dispatch.create({
    data: {
      practiceId,
      appointmentId: completed.id,
      whatsappInstanceId: instance.id,
      scheduledFor: new Date("2026-03-09T21:00:00Z"),
      sentAt: new Date("2026-03-09T21:00:05Z"),
      status: "READ",
      messageText: `Olá, ${name.split(" ")[0]}! Confirma sua consulta?`,
      replyText: "Sim, mas vou atrasar por causa do exame",
      repliedAt: new Date("2026-03-09T21:10:00Z"),
    },
  });
  // What the sandbox provider recorded for that message (Block 5).
  await db.sandboxMessage.create({
    data: { practiceId, whatsappInstanceId: instance.id, dispatchId: dispatch.id, toPhone: phone, text: dispatch.messageText, providerMessageId: `sandbox-${dispatch.id}` },
  });
  await db.contactConsent.create({ data: { practiceId, patientId: patient.id, granted: true, channel: "IN_PERSON", recordedAt: new Date("2026-03-01T12:00:00Z") } });
  await db.auditEvent.create({
    data: { practiceId, actorType: "USER", actorUserId: manager.user.id, action: "patient.created", entityType: "Patient", entityId: patient.id, changedFields: [] },
  });
  return { patient, completed, canceled };
}

describe("exportPatientData", () => {
  it("delivers the patient's data in the practice, in Portuguese, and audits the export", async () => {
    const { patient, completed } = await patientWithHistory("Helena Exporta", "+5585981110001");
    const { filename, data } = await exportPatientData(manager, patient.id, new Date("2026-10-28T15:00:00Z"));
    expect(filename).toMatch(/^dados-paciente-[0-9a-f]{8}-2026-10-28\.json$/);
    expect(data).toMatchObject({
      geradoEm: "2026-10-28T15:00:00.000Z",
      conta: "Consultório Titular",
      paciente: { id: patient.id, nome: "Helena Exporta", celular: "(85) 98111-0001", convenio: "Unimed", observacoes: "Prefere manhã", excluidoEm: null },
      consentimentos: [{ situacao: "Aceita", canal: "Presencial", registradoEm: "2026-03-01T12:00:00.000Z" }],
    });
    expect(data.agendamentos.map((row) => row.status)).toEqual(["Cancelado pelo paciente", "Atendido"]);
    const visit = data.agendamentos.find((row) => row.id === completed.id)!;
    expect(visit).toMatchObject({
      data: "10/03/2026",
      hora: "09:00",
      fusoHorario: "America/Fortaleza",
      unidade: "Unidade Aldeota",
      endereco: "Av. Teste, 100",
      profissional: "Dra. Ana Teste",
      tipo: "Primeira consulta",
      categoria: "Consulta",
      duracaoMinutos: 30,
      valor: "R$ 450,00",
      convenio: "Unimed",
      origem: "Instagram",
      observacaoInterna: "Alergia a dipirona",
    });
    expect(visit.mensagens).toEqual([
      expect.objectContaining({ situacao: "Lida", texto: "Olá, Helena! Confirma sua consulta?", resposta: "Sim, mas vou atrasar por causa do exame" }),
    ]);
    const canceled = data.agendamentos.find((row) => row.id !== completed.id)!;
    expect(canceled.historico.map((entry) => [entry.de, entry.para, entry.motivo])).toEqual([
      [null, "Agendado", null],
      ["Agendado", "Cancelado pelo paciente", "Ligou dizendo que está internada"],
    ]);
    expect(JSON.stringify(data)).not.toContain(manager.user.name);
    expect(await fixture.db.auditEvent.findFirst({ where: { action: "patient.exported", entityId: patient.id } })).toMatchObject({
      actorUserId: manager.user.id,
      changedFields: [],
    });
  });

  it("does not reach another practice and is refused to the secretary", async () => {
    await expect(exportPatientData(manager, other.patient.id)).rejects.toMatchObject({ code: "patient_unavailable" });
    const secretary = await contextAs(fixture, "SECRETARY");
    await expect(exportPatientData(secretary, fixture.patient.id)).rejects.toMatchObject({ code: "not_allowed" });
  });
});

describe("erasePatient (D-28)", () => {
  it("pseudonymizes the patient and strips personal data from the appointments, keeping them and the audit trail", async () => {
    const { patient, completed, canceled } = await patientWithHistory("Íris Apaga", "+5585981110002");
    const auditBefore = await fixture.db.auditEvent.findMany({ where: { entityId: patient.id }, orderBy: { occurredAt: "asc" } });

    await erasePatient(manager, { patientId: patient.id, confirmation: " excluir " });

    const stored = await fixture.db.patient.findUniqueOrThrow({ where: { id: patient.id } });
    expect(stored).toMatchObject({ name: "Paciente excluído", phone: null, insurance: null, notes: null, searchName: "paciente excluido" });
    expect(stored.anonymizedAt).toBeInstanceOf(Date);

    const appointments = await fixture.db.appointment.findMany({ where: { patientId: patient.id }, orderBy: { startsAt: "asc" } });
    expect(appointments.map((row) => [row.id, row.status, row.priceCents, row.insurance, row.internalNote])).toEqual([
      [completed.id, "COMPLETED", 45000, null, null],
      [canceled.id, "CANCELED_BY_PATIENT", 45000, null, null],
    ]);
    const changes = await fixture.db.appointmentStatusChange.findMany({ where: { appointmentId: { in: [completed.id, canceled.id] } } });
    expect(changes).toHaveLength(3);
    expect(changes.every((change) => change.reason === null)).toBe(true);
    const dispatch = await fixture.db.dispatch.findFirstOrThrow({ where: { appointmentId: completed.id } });
    expect(dispatch).toMatchObject({ status: "READ", messageText: null, replyText: null });
    expect(await fixture.db.sandboxMessage.findFirst({ where: { dispatchId: dispatch.id } })).toMatchObject({ toPhone: null, text: null });
    expect(await fixture.db.contactConsent.count({ where: { patientId: patient.id } })).toBe(1);

    const auditAfter = await fixture.db.auditEvent.findMany({ where: { entityId: patient.id }, orderBy: { occurredAt: "asc" } });
    expect(auditAfter.slice(0, auditBefore.length)).toEqual(auditBefore);
    expect(auditAfter.at(-1)).toMatchObject({
      action: "patient.anonymized",
      actorUserId: manager.user.id,
      changedFields: [
        "name",
        "phone",
        "insurance",
        "notes",
        "appointments.insurance",
        "appointments.internalNote",
        "statusChanges.reason",
        "dispatches.messageText",
        "dispatches.replyText",
        "sandboxMessages.toPhone",
        "sandboxMessages.text",
        "crmContactId",
        "crmInboundEvents.externalContactId",
      ],
    });

    const secretary = await contextAs(fixture, "SECRETARY");
    expect(await searchPatients(secretary, "iris")).toEqual([]);
    expect(await searchPatients(secretary, "81110002")).toEqual([]);
  });

  it("frees the phone, so the same person can be registered again", async () => {
    const { patient } = await patientWithHistory("Joel Volta", "+5585981110003");
    await erasePatient(manager, { patientId: patient.id, confirmation: "EXCLUIR" });
    await fixture.db.patient.create({ data: { practiceId: fixture.practiceId, name: "Joel Volta", phone: "+5585981110003" } });
  });

  it("asks for the typed confirmation and refuses a second erasure", async () => {
    const { patient } = await patientWithHistory("Kátia Confirma", "+5585981110004");
    await expect(erasePatient(manager, { patientId: patient.id, confirmation: "sim" })).rejects.toMatchObject({ code: "confirmation_required" });
    await erasePatient(manager, { patientId: patient.id, confirmation: "EXCLUIR" });
    await expect(erasePatient(manager, { patientId: patient.id, confirmation: "EXCLUIR" })).rejects.toMatchObject({ code: "patient_unavailable" });
  });

  it("waits until no appointment is open, past ones without closing included", async () => {
    const { db, practiceId } = fixture;
    const patient = await db.patient.create({ data: { practiceId, name: "Lia Aberta", phone: "+5585981110005" } });
    await db.appointment.create({
      data: {
        practiceId,
        locationId: fixture.locations.aldeota.id,
        professionalId: fixture.professionals.bruno.id,
        patientId: patient.id,
        appointmentTypeId: fixture.types.consultation.id,
        startsAt: new Date("2026-02-10T12:00:00Z"),
        endsAt: new Date("2026-02-10T12:30:00Z"),
        durationMinutes: 30,
        priceCents: 45000,
        status: "CONFIRMED",
      },
    });
    await expect(erasePatient(manager, { patientId: patient.id, confirmation: "EXCLUIR" })).rejects.toMatchObject({ code: "open_appointments" });
    expect((await db.patient.findUniqueOrThrow({ where: { id: patient.id } })).anonymizedAt).toBeNull();
  });

  it("is refused to the secretary and does not reach another practice", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    await expect(erasePatient(secretary, { patientId: fixture.patient.id, confirmation: "EXCLUIR" })).rejects.toMatchObject({ code: "not_allowed" });
    await expect(erasePatient(manager, { patientId: other.patient.id, confirmation: "EXCLUIR" })).rejects.toMatchObject({ code: "patient_unavailable" });
    expect((await other.db.patient.findUniqueOrThrow({ where: { id: other.patient.id } })).name).toBe("Maria Souza");
  });
});

describe("SynkronosCRM in the data subject's requests (D-28, D-68)", () => {
  async function connectedFixture(name: string) {
    const other = await createAgendaFixture(name);
    await connectCrm(other.practiceId);
    await addInstance(other.practiceId, other.professionals.ana.id);
    const manager = await contextAs(other, "PRACTICE_MANAGER");
    const secretary = await contextAs(other, "SECRETARY");
    const { id: appointmentId } = await createAppointment(secretary, {
      patientId: other.patient.id,
      professionalId: other.professionals.ana.id,
      locationId: other.locations.aldeota.id,
      appointmentTypeId: other.types.procedure.id,
      date: dayAhead(4),
      time: "10:00",
    });
    await exportToCrm(other.practiceId);
    return { other, manager, secretary, appointmentId };
  }

  beforeEach(() => {
    vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
  });

  it("exports the link to the contact and the ids of the notes", async () => {
    const { other, manager, appointmentId } = await connectedFixture("Consultório LGPD Exporta");
    const contact = (await crmContactOf(other.practiceId, other.patient.phone!))!;
    const { data } = await exportPatientData(manager, other.patient.id);
    expect(data.paciente.contatoNaSynkronos).toBe(contact.id);
    const appointment = data.agendamentos.find((row) => row.id === appointmentId)!;
    expect(appointment.notasNaSynkronos).toEqual(contact.notes.map((note) => note.id));
  });

  it("takes back the notes and the agenda's tags, and forgets the contact; the contact's own tags stay", async () => {
    const { other, manager, secretary, appointmentId } = await connectedFixture("Consultório LGPD Exclui");
    const phone = other.patient.phone!;
    const contact = (await crmContactOf(other.practiceId, phone))!;
    await applySandboxTag(other.practiceId, contact.id, "Lead");
    await changeAppointmentStatus(secretary, { appointmentId, to: "CANCELED_BY_PATIENT" });
    await exportToCrm(other.practiceId);
    expect((await crmContactOf(other.practiceId, phone))!.notes).toHaveLength(2);
    await other.db.crmInboundEvent.create({ data: { practiceId: other.practiceId, deliveryKey: "k", origin: "webhook", command: "confirm", outcome: "confirmed", externalContactId: contact.id, patientId: other.patient.id, appointmentId } });

    await erasePatient(manager, { patientId: other.patient.id, confirmation: "EXCLUIR" });

    // Nothing personal left here, even before the export runs.
    let patient = await other.db.patient.findUniqueOrThrow({ where: { id: other.patient.id } });
    expect(patient.phone).toBeNull();
    expect(patient.crmEraseRequestedAt).not.toBeNull();
    expect((await other.db.crmInboundEvent.findFirstOrThrow({ where: { patientId: other.patient.id } })).externalContactId).toBeNull();

    await exportToCrm(other.practiceId);

    patient = await other.db.patient.findUniqueOrThrow({ where: { id: other.patient.id } });
    expect(patient.crmContactId).toBeNull();
    expect(patient.crmEraseRequestedAt).toBeNull();
    const after = (await crmContactOf(other.practiceId, phone))!;
    expect(after.notes).toEqual([]);
    expect(after.tagNames).toEqual(["Lead"]);
    expect((await other.db.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).crmNoteIds).toEqual([]);
    const audit = await other.db.auditEvent.findFirstOrThrow({ where: { entityId: other.patient.id, action: "patient.anonymized" } });
    expect(audit.changedFields).toEqual(expect.arrayContaining(["crmContactId", "crmInboundEvents.externalContactId"]));
  });

  it("keeps trying while the CRM is down: nothing else would clear the notes", async () => {
    const { other, manager, secretary, appointmentId } = await connectedFixture("Consultório LGPD Fora");
    const phone = other.patient.phone!;
    await changeAppointmentStatus(secretary, { appointmentId, to: "CANCELED_BY_PATIENT" });
    await exportToCrm(other.practiceId);
    await erasePatient(manager, { patientId: other.patient.id, confirmation: "EXCLUIR" });

    const now = new Date();
    await exportToCrm(other.practiceId, { now, provider: failingCrm(other.practiceId, "transient", ["deleteNote"]) });
    const patient = await other.db.patient.findUniqueOrThrow({ where: { id: other.patient.id } });
    expect(patient.crmEraseRequestedAt).not.toBeNull();
    expect(patient.crmSyncRetryAt!.getTime()).toBeGreaterThan(now.getTime());
    expect((await crmContactOf(other.practiceId, phone))!.notes.length).toBeGreaterThan(0);

    await exportToCrm(other.practiceId, { now: new Date(patient.crmSyncRetryAt!.getTime() + 1_000) });
    expect((await other.db.patient.findUniqueOrThrow({ where: { id: other.patient.id } })).crmEraseRequestedAt).toBeNull();
    expect((await crmContactOf(other.practiceId, phone))!.notes).toEqual([]);
  });

  it("never sends an erased patient to the CRM again", async () => {
    const { other, manager, secretary, appointmentId } = await connectedFixture("Consultório LGPD Depois");
    await changeAppointmentStatus(secretary, { appointmentId, to: "CANCELED_BY_PATIENT" });
    await exportToCrm(other.practiceId);
    await erasePatient(manager, { patientId: other.patient.id, confirmation: "EXCLUIR" });
    await exportToCrm(other.practiceId);
    await other.db.appointment.update({ where: { id: appointmentId }, data: { crmSyncRequestedAt: new Date() } });
    const summary = await exportToCrm(other.practiceId);
    expect(summary.skipped).toBe(1);
    expect((await crmContactOf(other.practiceId, other.patient.phone!))!.notes).toEqual([]);
  });

  it("without a connection, just forgets the contact", async () => {
    const other = await createAgendaFixture("Consultório LGPD Sem CRM");
    const manager = await contextAs(other, "PRACTICE_MANAGER");
    await other.db.patient.update({ where: { id: other.patient.id }, data: { crmContactId: "contato-antigo" } });
    await erasePatient(manager, { patientId: other.patient.id, confirmation: "EXCLUIR" });
    const patient = await other.db.patient.findUniqueOrThrow({ where: { id: other.patient.id } });
    expect(patient.crmContactId).toBeNull();
    expect(patient.crmEraseRequestedAt).toBeNull();
  });
});
