import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { createAppointment } from "@/lib/appointments/appointments";
import { forPractice, prisma } from "@/lib/db";
import { addInstance, createCadence, createPatient, createTypeWithCadence, dayAhead, dispatchesOf, openWindowAllDay } from "../../../tests/helpers/cadence";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { handleIncomingMessage, normalizeReply, phoneCandidates, readReply } from "./replies";

// The patient's answers (PRD 6; D-05, D-08, D-47).

let fixture: AgendaFixture;
let db: ReturnType<typeof forPractice>;
let secretary: PracticeContext;
let instanceId: string;
let otherInstanceId: string;
let typeId: string;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Régua Respostas");
  db = forPractice(fixture.practiceId);
  await openWindowAllDay(fixture.practiceId);
  instanceId = (await addInstance(fixture.practiceId, fixture.professionals.ana.id)).id;
  otherInstanceId = (await addInstance(fixture.practiceId, fixture.professionals.bruno.id)).id;
  const cadence = await createCadence(fixture.practiceId, "Respostas", [
    { anchor: "APPOINTMENT", offsetMinutes: -2880, fixedTime: "18:00", eligibleStatuses: ["SCHEDULED", "CONFIRMED"], action: "REMINDER" },
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", action: "REQUEST_CONFIRMATION" },
    { anchor: "APPOINTMENT", offsetMinutes: -180, action: "REQUEST_CONFIRMATION" },
  ]);
  typeId = (await createTypeWithCadence(fixture.practiceId, "Consulta respostas", cadence.id)).id;
  secretary = await contextAs(fixture, "SECRETARY");
});

afterAll(async () => {
  await prisma.$disconnect();
});

let nextDay = 10;

/** Books with the cadence (each on a day of its own) and marks its confirmation request as sent `minutesAgo` ago. */
async function bookAndAsk(patientId: string, days = nextDay++, minutesAgo = 5, time = "10:00") {
  const { id } = await createAppointment(secretary, {
    patientId,
    professionalId: fixture.professionals.ana.id,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: typeId,
    date: dayAhead(days),
    time,
  });
  const request = (await dispatchesOf(fixture.practiceId, id)).find((row) => row.cadenceStep?.position === 2)!;
  await db.dispatch.update({
    where: { id: request.id },
    data: { status: "SENT", sentAt: new Date(Date.now() - minutesAgo * 60_000), providerMessageId: `wamid-${request.id}` },
  });
  return { appointmentId: id, requestId: request.id };
}

const fromPhone = (phone: string) => `${phone.slice(1)}@s.whatsapp.net`;
const reply = (phone: string, text: string, toInstance = instanceId) =>
  handleIncomingMessage(fixture.practiceId, toInstance, { from: fromPhone(phone), text, fromMe: false, isGroup: false });
const statusOf = async (id: string) => (await db.appointment.findUniqueOrThrow({ where: { id } })).status;

describe("reading the answer (D-08)", () => {
  it("accepts only exact answers after normalizing", () => {
    expect(["1", " Sim! ", "CONFIRMO.", "sim 🙂"].map(readReply)).toEqual(["confirm", "confirm", "confirm", "confirm"]);
    expect(["2", "Remarcar"].map(readReply)).toEqual(["reschedule", "reschedule"]);
    expect(["3", "Não", "nao", "Cancelar!"].map(readReply)).toEqual(["cancel", "cancel", "cancel", "cancel"]);
    expect(readReply("PARAR")).toBe("stop");
    expect(["não consigo às 10, pode às 11?", "1 sim", "sim, confirmo", "ok", ""].map(readReply)).toEqual(Array(5).fill("free_text"));
    expect(normalizeReply("  ¡Não!  ")).toBe("nao");
  });

  it("tries the WhatsApp id with and without the ninth digit", () => {
    expect(phoneCandidates("5585998124455@s.whatsapp.net")).toEqual(["+5585998124455", "+558598124455"]);
    expect(phoneCandidates("558598124455@s.whatsapp.net")).toEqual(["+558598124455", "+5585998124455"]);
    expect(phoneCandidates("5585998124455:12@s.whatsapp.net")).toEqual(["+5585998124455", "+558598124455"]);
    expect(phoneCandidates("123456789@lid")).toEqual([]);
    expect(phoneCandidates("120363000000001@g.us")).toEqual([]);
  });
});

describe("handleIncomingMessage", () => {
  it("confirms on 1, records the answer and ends only the confirmation requests (D-06)", async () => {
    const patient = await createPatient(fixture.practiceId);
    const { appointmentId, requestId } = await bookAndAsk(patient.id);

    expect(await reply(patient.phone!, "1")).toEqual({ result: "confirmed", appointmentId });
    expect(await statusOf(appointmentId)).toBe("CONFIRMED");
    const dispatches = await dispatchesOf(fixture.practiceId, appointmentId);
    expect(dispatches.map((row) => [row.cadenceStep?.position, row.status])).toEqual([
      [1, "SCHEDULED"],
      [2, "READ"],
      [3, "CANCELED"],
    ]);
    expect(dispatches.find((row) => row.id === requestId)).toMatchObject({ replyText: "1" });
    const history = await db.appointmentStatusChange.findFirstOrThrow({ where: { appointmentId, toStatus: "CONFIRMED" } });
    expect(history).toMatchObject({ source: "CADENCE_REPLY", changedByUserId: null });
    const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: appointmentId, action: "appointment.status_changed" } });
    expect(audit).toMatchObject({ actorType: "PATIENT", actorUserId: null });
  });

  it("cancels on 3 and ends the cadence", async () => {
    const patient = await createPatient(fixture.practiceId);
    const { appointmentId } = await bookAndAsk(patient.id);
    expect(await reply(patient.phone!, "Cancelar")).toEqual({ result: "canceled", appointmentId });
    expect(await statusOf(appointmentId)).toBe("CANCELED_BY_PATIENT");
    expect((await dispatchesOf(fixture.practiceId, appointmentId)).filter((row) => row.status === "SCHEDULED")).toEqual([]);
  });

  it("only flags Pediu remarcação on 2 in the MVP", async () => {
    const patient = await createPatient(fixture.practiceId);
    const { appointmentId } = await bookAndAsk(patient.id);
    expect(await reply(patient.phone!, "2")).toEqual({ result: "reschedule_requested", appointmentId });
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
    expect(await db.appointmentFlag.count({ where: { appointmentId, type: "RESCHEDULE_REQUESTED", resolvedAt: null } })).toBe(1);
    expect((await dispatchesOf(fixture.practiceId, appointmentId)).filter((row) => row.status === "SCHEDULED")).toHaveLength(2);
  });

  it("flags free text without changing the status, and a later 1 still confirms", async () => {
    const patient = await createPatient(fixture.practiceId);
    const { appointmentId } = await bookAndAsk(patient.id);
    expect(await reply(patient.phone!, "não consigo às 10, pode às 11?")).toEqual({ result: "free_text", appointmentId });
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
    expect(await db.appointmentFlag.count({ where: { appointmentId, type: "REPLIED_WITHOUT_CONFIRMING", resolvedAt: null } })).toBe(1);

    expect(await reply(patient.phone!, "1")).toEqual({ result: "confirmed", appointmentId });
    expect(await db.appointmentFlag.count({ where: { appointmentId, resolvedAt: null } })).toBe(0);
  });

  it("applies the answer to the appointment of the latest message sent", async () => {
    const patient = await createPatient(fixture.practiceId);
    const older = await bookAndAsk(patient.id, 40, 60);
    const latest = await bookAndAsk(patient.id, 42, 5);
    expect(await reply(patient.phone!, "sim")).toEqual({ result: "confirmed", appointmentId: latest.appointmentId });
    expect(await statusOf(older.appointmentId)).toBe("SCHEDULED");
  });

  it("does nothing when the latest message is about an appointment already past", async () => {
    const patient = await createPatient(fixture.practiceId);
    const future = await bookAndAsk(patient.id, nextDay++, 120);
    const past = await db.appointment.create({
      data: {
        practiceId: fixture.practiceId,
        locationId: fixture.locations.aldeota.id,
        professionalId: fixture.professionals.ana.id,
        patientId: patient.id,
        appointmentTypeId: typeId,
        startsAt: new Date(Date.now() - 60 * 60_000),
        endsAt: new Date(Date.now() - 30 * 60_000),
        durationMinutes: 30,
        priceCents: 0,
      },
    });
    await db.dispatch.create({
      data: { practiceId: fixture.practiceId, appointmentId: past.id, whatsappInstanceId: instanceId, scheduledFor: new Date(Date.now() - 90 * 60_000), sentAt: new Date(Date.now() - 90 * 60_000), status: "SENT" },
    });
    expect(await reply(patient.phone!, "1")).toEqual({ result: "ignored", reason: "appointment_passed" });
    expect(await statusOf(future.appointmentId)).toBe("SCHEDULED");
  });

  it("only counts messages sent by the instance the answer came to", async () => {
    const patient = await createPatient(fixture.practiceId);
    const { appointmentId } = await bookAndAsk(patient.id);
    expect(await reply(patient.phone!, "1", otherInstanceId)).toEqual({ result: "ignored", reason: "no_cadence_message" });
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
  });

  it("finds the patient when WhatsApp sends the number without the ninth digit", async () => {
    // An old mobile: 8 digits starting with 8, the 9 added in front later.
    const patient = await createPatient(fixture.practiceId, { phone: "+5585988124400" });
    const { appointmentId } = await bookAndAsk(patient.id);
    const withoutNinth = `55${patient.phone!.slice(3, 5)}${patient.phone!.slice(6)}@s.whatsapp.net`;
    expect(await handleIncomingMessage(fixture.practiceId, instanceId, { from: withoutNinth, text: "1", fromMe: false, isGroup: false })).toEqual({
      result: "confirmed",
      appointmentId,
    });
  });

  it("ignores our own messages, groups and unknown numbers", async () => {
    const patient = await createPatient(fixture.practiceId);
    await bookAndAsk(patient.id);
    const base = { from: fromPhone(patient.phone!), text: "1" };
    expect(await handleIncomingMessage(fixture.practiceId, instanceId, { ...base, fromMe: true, isGroup: false })).toMatchObject({ reason: "own_message" });
    expect(await handleIncomingMessage(fixture.practiceId, instanceId, { ...base, fromMe: false, isGroup: true })).toMatchObject({ reason: "group" });
    expect(await reply("+5585900001111", "1")).toMatchObject({ reason: "unknown_sender" });
  });

  it("revokes consent on PARAR with a new log row and cancels the scheduled dispatches (D-47)", async () => {
    const patient = await createPatient(fixture.practiceId);
    const { appointmentId } = await bookAndAsk(patient.id);
    expect(await reply(patient.phone!, "Parar")).toEqual({ result: "stopped", patientId: patient.id });

    const latest = await db.contactConsent.findFirstOrThrow({ where: { patientId: patient.id }, orderBy: { recordedAt: "desc" } });
    expect(latest).toMatchObject({ granted: false, channel: "WHATSAPP", recordedByUserId: null });
    expect((await dispatchesOf(fixture.practiceId, appointmentId)).filter((row) => row.status === "SCHEDULED")).toEqual([]);
    expect(await db.auditEvent.count({ where: { entityId: latest.id, actorType: "PATIENT" } })).toBe(1);

    await reply(patient.phone!, "PARAR");
    expect(await db.contactConsent.count({ where: { patientId: patient.id } })).toBe(2);
  });
});
