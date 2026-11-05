import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forPractice, prisma } from "@/lib/db";
import { MemoryEmailSender } from "@/lib/email/memory";
import { MessagingError, type MessagingProvider } from "@/lib/messaging";
import { addMember, createUser } from "../../../tests/helpers/auth";
import { addInstance, createCadence, createPatient } from "../../../tests/helpers/cadence";
import { createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { setInstanceConnection } from "./instances";
import { sendNextDue, sendNextDueAndPeek } from "./sender";

// The sender (PRD 6; D-06, D-07, D-09): one message at a time per instance, 8 s
// apart, everything checked again before sending, a disconnected instance holds its
// queue, and the last unanswered confirmation request flags "Sem confirmação".
// Times are fixed: Tuesday 2 March 2027, 10h in Fortaleza; the window is 8h–20h,
// Monday to Saturday, with the 2 h margin.

const fz = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);
const NOW = fz("2027-03-02", "10:00");
const minutes = (count: number) => new Date(NOW.getTime() + count * 60_000);

let fixture: AgendaFixture;
let db: ReturnType<typeof forPractice>;
let steps: { reminder: string; request: string; confirmedReminder: string };

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Régua Envio");
  db = forPractice(fixture.practiceId);
  const cadence = await createCadence(fixture.practiceId, "Envio", [
    { anchor: "BOOKING", action: "REMINDER", template: "Olá, {primeiro_nome}! {tipo} com {profissional} {data_extenso} às {hora}." },
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", action: "REQUEST_CONFIRMATION", template: "Confirma, {primeiro_nome}? Responda 1." },
    { anchor: "APPOINTMENT", offsetMinutes: -2880, eligibleStatuses: ["SCHEDULED", "CONFIRMED"], action: "REMINDER", template: "Lembrete" },
  ]);
  steps = { reminder: cadence.steps[0].id, request: cadence.steps[1].id, confirmedReminder: cadence.steps[2].id };
  await db.appointmentType.update({ where: { id: fixture.types.consultation.id }, data: { cadenceId: cadence.id } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A professional of its own and an instance, so tests never share a queue. */
async function freshInstance(status: "CONNECTED" | "DISCONNECTED" = "CONNECTED") {
  const professional = await db.professional.create({ data: { practiceId: fixture.practiceId, name: "Dra. Fila" } });
  await db.professionalLocation.create({ data: { practiceId: fixture.practiceId, professionalId: professional.id, locationId: fixture.locations.aldeota.id } });
  const instance = await addInstance(fixture.practiceId, professional.id, { status });
  return { professional, instance };
}

async function appointment(professionalId: string, startsAt: Date, options: { patientId?: string; status?: "SCHEDULED" | "CONFIRMED"; cadenceEnabled?: boolean } = {}) {
  const patientId = options.patientId ?? (await createPatient(fixture.practiceId, { name: "Maria Souza" })).id;
  return db.appointment.create({
    data: {
      practiceId: fixture.practiceId,
      locationId: fixture.locations.aldeota.id,
      professionalId,
      patientId,
      appointmentTypeId: fixture.types.consultation.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      durationMinutes: 30,
      priceCents: 45000,
      status: options.status ?? "SCHEDULED",
      cadenceEnabled: options.cadenceEnabled ?? true,
    },
  });
}

async function queue(appointmentId: string, instanceId: string, stepId: string, scheduledFor: Date, extra: { manual?: boolean } = {}) {
  return db.dispatch.create({
    data: { practiceId: fixture.practiceId, appointmentId, cadenceStepId: stepId, cadenceVersion: 1, whatsappInstanceId: instanceId, scheduledFor, manual: extra.manual ?? false },
  });
}

const reload = (id: string) => db.dispatch.findUniqueOrThrow({ where: { id } });

describe("sendNextDueAndPeek", () => {
  it("says more is due only when it is: the drain spends no wait on the last one (D-100)", async () => {
    const { professional, instance } = await freshInstance();
    const first = await appointment(professional.id, fz("2027-03-03", "10:00"));
    const second = await appointment(professional.id, fz("2027-03-04", "10:00"));
    await queue(first.id, instance.id, steps.reminder, minutes(-2));
    await queue(second.id, instance.id, steps.reminder, minutes(-1));

    expect(await sendNextDueAndPeek(fixture.practiceId, instance.id, NOW)).toMatchObject({ result: "sent", more: true });
    expect(await sendNextDueAndPeek(fixture.practiceId, instance.id, minutes(1))).toMatchObject({ result: "sent", more: false });
  });

  it("does not count what is due later", async () => {
    const { professional, instance } = await freshInstance();
    const first = await appointment(professional.id, fz("2027-03-03", "10:00"));
    const second = await appointment(professional.id, fz("2027-03-04", "10:00"));
    await queue(first.id, instance.id, steps.reminder, minutes(-1));
    await queue(second.id, instance.id, steps.reminder, minutes(60));
    expect(await sendNextDueAndPeek(fixture.practiceId, instance.id, NOW)).toMatchObject({ result: "sent", more: false });
  });

  it("passes on the other answers as they are", async () => {
    const { instance } = await freshInstance();
    expect(await sendNextDueAndPeek(fixture.practiceId, instance.id, NOW)).toMatchObject({ result: "idle" });
  });
});

describe("sendNextDue", () => {
  it("sends the due dispatch through the provider with the text filled in", async () => {
    const { professional, instance } = await freshInstance();
    const booked = await appointment(professional.id, fz("2027-03-03", "10:00"));
    const dispatch = await queue(booked.id, instance.id, steps.reminder, minutes(-1));

    expect(await sendNextDue(fixture.practiceId, instance.id, NOW)).toEqual({ result: "sent", dispatchId: dispatch.id });
    const sent = await reload(dispatch.id);
    expect(sent).toMatchObject({ status: "SENT", sentAt: NOW, attempts: 1, lockedUntil: null });
    expect(sent.messageText).toBe("Olá, Maria! Consulta com Dra. Fila quarta-feira, 3 de março às 10:00.");
    const sandbox = await db.sandboxMessage.findFirstOrThrow({ where: { dispatchId: dispatch.id } });
    expect(sandbox).toMatchObject({ whatsappInstanceId: instance.id, text: sent.messageText, providerMessageId: sent.providerMessageId });
    expect(sandbox.toPhone).toMatch(/^\+55859/);
  });

  it("waits for nothing that is not due", async () => {
    const { professional, instance } = await freshInstance();
    const booked = await appointment(professional.id, fz("2027-03-03", "10:00"));
    await queue(booked.id, instance.id, steps.reminder, minutes(5));
    expect(await sendNextDue(fixture.practiceId, instance.id, NOW)).toEqual({ result: "idle" });
  });

  it("keeps 8 s between two messages of the same instance", async () => {
    const { professional, instance } = await freshInstance();
    const first = await appointment(professional.id, fz("2027-03-03", "10:00"));
    const second = await appointment(professional.id, fz("2027-03-03", "11:00"));
    await queue(first.id, instance.id, steps.reminder, minutes(-2));
    const later = await queue(second.id, instance.id, steps.reminder, minutes(-1));

    expect((await sendNextDue(fixture.practiceId, instance.id, NOW)).result).toBe("sent");
    expect(await sendNextDue(fixture.practiceId, instance.id, new Date(NOW.getTime() + 3_000))).toEqual({ result: "wait", waitMs: 5_000 });
    expect(await sendNextDue(fixture.practiceId, instance.id, new Date(NOW.getTime() + 8_000))).toEqual({ result: "sent", dispatchId: later.id });
  });

  it("checks again, before sending, the status, the cadence switch, the consent, the pause and the appointment time", async () => {
    const { professional, instance } = await freshInstance();
    const confirmed = await appointment(professional.id, fz("2027-03-03", "10:00"), { status: "CONFIRMED" });
    const off = await appointment(professional.id, fz("2027-03-03", "11:00"), { cadenceEnabled: false });
    const revoked = await appointment(professional.id, fz("2027-03-03", "12:00"));
    await db.contactConsent.create({ data: { practiceId: fixture.practiceId, patientId: revoked.patientId, granted: false, channel: "WHATSAPP" } });
    const paused = await appointment(professional.id, fz("2027-03-03", "13:00"));
    await db.appointmentFlag.create({ data: { practiceId: fixture.practiceId, appointmentId: paused.id, type: "REPLIED_WITHOUT_CONFIRMING" } });
    const past = await appointment(professional.id, minutes(-10));

    const cases = [
      [await queue(confirmed.id, instance.id, steps.request, minutes(-5)), "CANCELED", "not_eligible"],
      [await queue(off.id, instance.id, steps.reminder, minutes(-4)), "CANCELED", "cadence_off"],
      [await queue(revoked.id, instance.id, steps.reminder, minutes(-3)), "CANCELED", "no_consent"],
      [await queue(paused.id, instance.id, steps.reminder, minutes(-2)), "SKIPPED", "paused"],
      [await queue(past.id, instance.id, steps.reminder, minutes(-1)), "SKIPPED", "appointment_passed"],
    ] as const;
    for (const [dispatch, status, reason] of cases) {
      await sendNextDue(fixture.practiceId, instance.id, NOW);
      expect(await reload(dispatch.id)).toMatchObject({ status, statusReason: reason, sentAt: null });
    }
    expect(await db.sandboxMessage.count({ where: { whatsappInstanceId: instance.id } })).toBe(0);
  });

  it("postpones a step barred by the 4 h limit to the end of the interval, or skips it without the margin (D-07)", async () => {
    const { professional, instance } = await freshInstance();
    const patient = await createPatient(fixture.practiceId);
    const earlier = await appointment(professional.id, fz("2027-03-05", "10:00"), { patientId: patient.id });
    await db.dispatch.create({
      data: { practiceId: fixture.practiceId, appointmentId: earlier.id, cadenceStepId: steps.reminder, whatsappInstanceId: instance.id, scheduledFor: minutes(-60), sentAt: minutes(-60), status: "DELIVERED" },
    });
    const tomorrow = await appointment(professional.id, fz("2027-03-03", "10:00"), { patientId: patient.id });
    const today = await appointment(professional.id, fz("2027-03-02", "14:00"), { patientId: patient.id });
    const postponed = await queue(tomorrow.id, instance.id, steps.reminder, minutes(-2));
    const skipped = await queue(today.id, instance.id, steps.reminder, minutes(-1));

    expect((await sendNextDue(fixture.practiceId, instance.id, NOW)).result).toBe("postponed");
    expect(await reload(postponed.id)).toMatchObject({ status: "SCHEDULED", scheduledFor: fz("2027-03-02", "13:00"), statusReason: "rate_limited" });
    expect((await sendNextDue(fixture.practiceId, instance.id, NOW)).result).toBe("skipped");
    expect(await reload(skipped.id)).toMatchObject({ status: "SKIPPED", statusReason: "rate_limit" });
  });

  it("does not hold a manual dispatch to the 4 h limit", async () => {
    const { professional, instance } = await freshInstance();
    const patient = await createPatient(fixture.practiceId);
    const booked = await appointment(professional.id, fz("2027-03-03", "10:00"), { patientId: patient.id });
    await db.dispatch.create({
      data: { practiceId: fixture.practiceId, appointmentId: booked.id, cadenceStepId: steps.reminder, whatsappInstanceId: instance.id, scheduledFor: minutes(-30), sentAt: minutes(-30), status: "SENT" },
    });
    const manual = await queue(booked.id, instance.id, steps.request, NOW, { manual: true });
    expect(await sendNextDue(fixture.practiceId, instance.id, NOW)).toEqual({ result: "sent", dispatchId: manual.id });
  });

  it("flags Sem confirmação once the last confirmation request went out unanswered", async () => {
    const { professional, instance } = await freshInstance();
    const booked = await appointment(professional.id, fz("2027-03-03", "10:00"));
    await queue(booked.id, instance.id, steps.request, minutes(-1));
    const last = await queue(booked.id, instance.id, steps.request, fz("2027-03-02", "16:00"));
    const flags = () => db.appointmentFlag.findMany({ where: { appointmentId: booked.id, type: "NO_CONFIRMATION", resolvedAt: null } });

    await sendNextDue(fixture.practiceId, instance.id, NOW);
    expect(await flags()).toHaveLength(0);
    expect(await sendNextDue(fixture.practiceId, instance.id, fz("2027-03-02", "16:00"))).toEqual({ result: "sent", dispatchId: last.id });
    expect(await flags()).toHaveLength(1);
  });

  it("does not flag Sem confirmação when the patient answered", async () => {
    const { professional, instance } = await freshInstance();
    const booked = await appointment(professional.id, fz("2027-03-03", "10:00"));
    await db.dispatch.create({
      data: { practiceId: fixture.practiceId, appointmentId: booked.id, cadenceStepId: steps.request, whatsappInstanceId: instance.id, scheduledFor: minutes(-600), sentAt: minutes(-600), status: "READ", replyText: "posso ir às 11?", repliedAt: minutes(-590) },
    });
    await queue(booked.id, instance.id, steps.request, minutes(-1));
    await sendNextDue(fixture.practiceId, instance.id, NOW);
    expect(await db.appointmentFlag.count({ where: { appointmentId: booked.id, type: "NO_CONFIRMATION" } })).toBe(0);
  });

  it("retries a transient failure twice, then records the failure", async () => {
    const { professional, instance } = await freshInstance();
    const booked = await appointment(professional.id, fz("2027-03-03", "10:00"));
    const dispatch = await queue(booked.id, instance.id, steps.reminder, minutes(-1));
    const failing: MessagingProvider = {
      sendText: () => Promise.reject(new MessagingError("transient", "timeout")),
      getConnection: async () => "connected",
      configureWebhook: async () => {},
    };

    expect((await sendNextDue(fixture.practiceId, instance.id, NOW, { provider: failing })).result).toBe("retry");
    expect(await sendNextDue(fixture.practiceId, instance.id, minutes(0.5), { provider: failing })).toEqual({ result: "idle" });
    expect((await sendNextDue(fixture.practiceId, instance.id, minutes(2), { provider: failing })).result).toBe("retry");
    expect((await sendNextDue(fixture.practiceId, instance.id, minutes(4), { provider: failing })).result).toBe("failed");
    expect(await reload(dispatch.id)).toMatchObject({ status: "FAILED", statusReason: "send_error", attempts: 3 });
  });

  it("fails a message more than 2 h late on a connected instance", async () => {
    const { professional, instance } = await freshInstance();
    const booked = await appointment(professional.id, fz("2027-03-03", "10:00"));
    const dispatch = await queue(booked.id, instance.id, steps.reminder, minutes(-150));
    expect((await sendNextDue(fixture.practiceId, instance.id, NOW)).result).toBe("failed");
    expect(await reload(dispatch.id)).toMatchObject({ status: "FAILED", statusReason: "overdue" });
  });
});

describe("disconnected instance (D-09)", () => {
  it("holds the queue while disconnected and marks the instance when the provider says so", async () => {
    const { professional, instance } = await freshInstance();
    const booked = await appointment(professional.id, fz("2027-03-03", "10:00"));
    const dispatch = await queue(booked.id, instance.id, steps.reminder, minutes(-1));
    const offline: MessagingProvider = {
      sendText: () => Promise.reject(new MessagingError("disconnected", "instance_not_connected")),
      getConnection: async () => "disconnected",
      configureWebhook: async () => {},
    };

    expect(await sendNextDue(fixture.practiceId, instance.id, NOW, { provider: offline })).toEqual({ result: "held" });
    expect(await reload(dispatch.id)).toMatchObject({ status: "SCHEDULED", lockedUntil: null });
    expect((await db.whatsappInstance.findUniqueOrThrow({ where: { id: instance.id } })).status).toBe("DISCONNECTED");
    expect(await sendNextDue(fixture.practiceId, instance.id, NOW)).toEqual({ result: "held" });
  });

  it("on reconnection sends only what is less than 2 h late with the appointment ahead; the rest fails", async () => {
    const { professional, instance } = await freshInstance("DISCONNECTED");
    const ahead = await appointment(professional.id, fz("2027-03-03", "10:00"));
    const gone = await appointment(professional.id, minutes(-20));
    const tooLate = await queue(ahead.id, instance.id, steps.confirmedReminder, minutes(-180));
    const inTime = await queue(ahead.id, instance.id, steps.reminder, minutes(-90));
    const passed = await queue(gone.id, instance.id, steps.reminder, minutes(-60));
    const future = await queue(ahead.id, instance.id, steps.request, fz("2027-03-02", "18:00"));

    await setInstanceConnection(fixture.practiceId, instance.id, "connected", NOW);
    expect(await reload(tooLate.id)).toMatchObject({ status: "FAILED", statusReason: "instance_disconnected" });
    expect(await reload(passed.id)).toMatchObject({ status: "FAILED", statusReason: "instance_disconnected" });
    expect(await reload(future.id)).toMatchObject({ status: "SCHEDULED" });
    expect(await sendNextDue(fixture.practiceId, instance.id, NOW)).toEqual({ result: "sent", dispatchId: inTime.id });
  });

  it("emails the managers and the professional when the instance disconnects", async () => {
    const { professional, instance } = await freshInstance();
    const manager = await createUser("alerta-gestor");
    await addMember(manager.id, fixture.practiceId, "PRACTICE_MANAGER");
    const doctor = await createUser("alerta-profissional");
    await addMember(doctor.id, fixture.practiceId, "PROFESSIONAL");
    await db.professional.update({ where: { id: professional.id }, data: { userId: doctor.id } });
    const emailSender = new MemoryEmailSender();

    await setInstanceConnection(fixture.practiceId, instance.id, "disconnected", NOW, { emailSender });
    const recipients = emailSender.sent.map((message) => message.to);
    expect(recipients).toEqual(expect.arrayContaining([manager.email, doctor.email]));
    expect(emailSender.sent[0].subject).toBe("WhatsApp desconectado: Dra. Fila");

    await setInstanceConnection(fixture.practiceId, instance.id, "disconnected", NOW, { emailSender });
    expect(emailSender.sent).toHaveLength(recipients.length);
  });
});
