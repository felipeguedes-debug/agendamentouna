import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { createAppointment } from "@/lib/appointments/appointments";
import { forPractice, prisma } from "@/lib/db";
import { addInstance, createCadence, createPatient, createTypeWithCadence, dayAhead, dispatchesOf, openWindowAllDay } from "../../../tests/helpers/cadence";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { getDispatchLog, listFollowUps, queueManualDispatch, recordManualContact, resumeCadence } from "./worklist";

// What the office sees and does with the cadence (PRD 6 rules 3 and 4; D-06; PRD 11).

let fixture: AgendaFixture;
let db: ReturnType<typeof forPractice>;
let secretary: PracticeContext;
let manager: PracticeContext;
let typeId: string;
let steps: { id: string }[];
let nextDay = 10;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Listas da Régua");
  db = forPractice(fixture.practiceId);
  await openWindowAllDay(fixture.practiceId);
  await addInstance(fixture.practiceId, fixture.professionals.ana.id);
  const cadence = await createCadence(fixture.practiceId, "Listas", [
    { anchor: "BOOKING", action: "REMINDER", template: "Olá, {primeiro_nome}! Até {data_extenso}." },
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", action: "REQUEST_CONFIRMATION", template: "Confirma? Responda 1." },
  ]);
  steps = cadence.steps;
  typeId = (await createTypeWithCadence(fixture.practiceId, "Consulta listas", cadence.id)).id;
  secretary = await contextAs(fixture, "SECRETARY");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function book(options: { consent?: boolean | null; professionalId?: string } = {}) {
  const patient = await createPatient(fixture.practiceId, { name: "Joana Prado", consent: options.consent });
  const { id } = await createAppointment(secretary, {
    patientId: patient.id,
    professionalId: options.professionalId ?? fixture.professionals.ana.id,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: typeId,
    date: dayAhead(nextDay++),
    time: "10:00",
  });
  return id;
}

describe("getDispatchLog", () => {
  it("shows each dispatch with its step, time and the text it will send", async () => {
    const id = await book();
    const log = await getDispatchLog(secretary, id);
    expect(log).toMatchObject({ situation: "active", cadenceName: "Listas", instanceStatus: "CONNECTED" });
    expect(log!.entries.map((entry) => [entry.position, entry.status, entry.manual])).toEqual([
      [1, "SCHEDULED", false],
      [2, "SCHEDULED", false],
    ]);
    expect(log!.entries[0].text).toMatch(/^Olá, Joana! Até /);
    expect(log!.entries[0].description).toBe("Ao agendar · lembrete");
    expect(log!.manualSteps.map((step) => step.id)).toEqual(steps.map((step) => step.id));
    expect(log).toMatchObject({ canRecordContact: true, canResume: false });
  });

  it("says why an appointment is out of the cadence", async () => {
    expect((await getDispatchLog(secretary, await book({ consent: null })))!.situation).toBe("no_consent");
    expect((await getDispatchLog(secretary, await book({ professionalId: fixture.professionals.bruno.id })))!.situation).toBe("no_instance");
    const off = await book();
    await db.appointment.update({ where: { id: off }, data: { cadenceEnabled: false } });
    expect((await getDispatchLog(secretary, off))!.situation).toBe("off");
  });

  it("shows the professional only their own appointments' log", async () => {
    const id = await book();
    const ana = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
    const bruno = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.bruno.id });
    expect((await getDispatchLog(ana, id))!.manualSteps).toEqual([]);
    expect(await getDispatchLog(bruno, id)).toBeNull();
  });
});

describe("queueManualDispatch (PRD 6, rule 3)", () => {
  it("queues the step's text now, marked manual, asks for a drain and audits it", async () => {
    const id = await book();
    const drain = vi.fn(async () => {});
    const dispatchId = await queueManualDispatch(secretary, { appointmentId: id, stepId: steps[1].id }, new Date(), { drain });
    const manual = await db.dispatch.findUniqueOrThrow({ where: { id: dispatchId } });
    expect(manual).toMatchObject({ manual: true, status: "SCHEDULED", cadenceStepId: steps[1].id });
    expect(drain).toHaveBeenCalledWith(fixture.practiceId, manual.whatsappInstanceId);
    expect(await db.auditEvent.count({ where: { entityId: dispatchId, action: "dispatch.manual", actorUserId: secretary.user.id } })).toBe(1);
  });

  it("refuses without consent, without instance, for a step of another cadence or for a closed appointment", async () => {
    const drain = async () => {};
    await expect(queueManualDispatch(secretary, { appointmentId: await book({ consent: false }), stepId: steps[0].id }, new Date(), { drain })).rejects.toMatchObject({ code: "no_consent" });
    await expect(
      queueManualDispatch(secretary, { appointmentId: await book({ professionalId: fixture.professionals.bruno.id }), stepId: steps[0].id }, new Date(), { drain }),
    ).rejects.toMatchObject({ code: "no_instance" });
    const other = await createCadence(fixture.practiceId, "Outra", [{ anchor: "BOOKING", action: "REMINDER" }]);
    await expect(queueManualDispatch(secretary, { appointmentId: await book(), stepId: other.steps[0].id }, new Date(), { drain })).rejects.toMatchObject({ code: "step_unavailable" });
    const canceled = await book();
    await db.appointment.update({ where: { id: canceled }, data: { status: "CANCELED_BY_PRACTICE" } });
    await expect(queueManualDispatch(secretary, { appointmentId: canceled, stepId: steps[0].id }, new Date(), { drain })).rejects.toMatchObject({ code: "appointment_not_open" });
  });

  it("is not for the professional", async () => {
    const ana = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
    await expect(queueManualDispatch(ana, { appointmentId: await book(), stepId: steps[0].id })).rejects.toMatchObject({ code: "not_allowed" });
  });
});

describe("manual contact and resuming (D-05, D-06)", () => {
  it("ends the confirmation requests and closes the follow-up flags; reminders go on", async () => {
    const id = await book();
    await db.appointmentFlag.create({ data: { practiceId: fixture.practiceId, appointmentId: id, type: "NO_CONFIRMATION" } });
    await recordManualContact(secretary, id);

    const dispatches = await dispatchesOf(fixture.practiceId, id);
    expect(dispatches.map((row) => [row.cadenceStep?.action, row.status, row.statusReason])).toEqual([
      ["REMINDER", "SCHEDULED", null],
      ["REQUEST_CONFIRMATION", "CANCELED", "manual_contact"],
    ]);
    const flags = await db.appointmentFlag.findMany({ where: { appointmentId: id } });
    expect(flags.map((flag) => [flag.type, flag.resolvedAt !== null]).sort()).toEqual([
      ["MANUAL_CONTACT", true],
      ["NO_CONFIRMATION", true],
    ]);
  });

  it("resumes a cadence paused by a free-text reply", async () => {
    const id = await book();
    await db.appointmentFlag.create({ data: { practiceId: fixture.practiceId, appointmentId: id, type: "REPLIED_WITHOUT_CONFIRMING" } });
    expect((await getDispatchLog(secretary, id))!).toMatchObject({ situation: "paused", canResume: true });
    await resumeCadence(secretary, id);
    expect((await getDispatchLog(secretary, id))!.situation).toBe("active");
  });
});

describe("listFollowUps (Sem confirmação)", () => {
  it("lists future appointments flagged by the cadence, by list, with the patient's last answer", async () => {
    const unconfirmed = await book();
    const reschedule = await book();
    const freeText = await book();
    const confirmed = await book();
    for (const [appointmentId, type] of [
      [unconfirmed, "NO_CONFIRMATION"],
      [reschedule, "RESCHEDULE_REQUESTED"],
      [freeText, "REPLIED_WITHOUT_CONFIRMING"],
      [confirmed, "NO_CONFIRMATION"],
    ] as const) {
      await db.appointmentFlag.create({ data: { practiceId: fixture.practiceId, appointmentId, type } });
    }
    await db.appointment.update({ where: { id: confirmed }, data: { status: "CONFIRMED" } });
    const request = (await dispatchesOf(fixture.practiceId, freeText))[1];
    await db.dispatch.update({ where: { id: request.id }, data: { status: "READ", sentAt: new Date(), replyText: "posso às 11?", repliedAt: new Date() } });

    const lists = await listFollowUps(manager);
    expect(lists.unconfirmed.map((row) => row.id)).toContain(unconfirmed);
    expect(lists.unconfirmed.map((row) => row.id)).not.toContain(confirmed);
    expect(lists.rescheduleRequested.map((row) => row.id)).toEqual([reschedule]);
    expect(lists.repliedWithoutConfirming).toEqual([expect.objectContaining({ id: freeText, patientName: "Joana Prado", lastReply: "posso às 11?" })]);
  });

  it("is not for the professional", async () => {
    const ana = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
    await expect(listFollowUps(ana)).rejects.toMatchObject({ code: "not_allowed" });
  });
});
