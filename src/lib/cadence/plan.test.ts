import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { changeAppointmentStatus, createAppointment, importAppointment, rescheduleAppointment } from "@/lib/appointments/appointments";
import { zonedToUtc } from "@/lib/dates/zoned";
import { forPractice, prisma } from "@/lib/db";
import { enableImportedCadence } from "@/lib/imports/agenda-import";
import { recordConsent } from "@/lib/patients/consent";
import {
  addInstance,
  createCadence,
  createPatient,
  createTypeWithCadence,
  dayAhead,
  dispatchesOf,
  localSlot,
  openWindowAllDay,
} from "../../../tests/helpers/cadence";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { replanAppointments } from "./plan";

// Which dispatches each appointment gets (PRD 6; D-06, D-07, D-11, D-18, D-47).
// The send window is open all day, so the planned times are the nominal ones.

const TZ = "America/Fortaleza";
let fixture: AgendaFixture;
let secretary: PracticeContext;
let manager: PracticeContext;
let instanceId: string;
let typeId: string;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Régua Plano");
  await openWindowAllDay(fixture.practiceId);
  instanceId = (await addInstance(fixture.practiceId, fixture.professionals.ana.id)).id;
  const cadence = await createCadence(fixture.practiceId, "Completa", [
    { anchor: "BOOKING", action: "REMINDER" },
    { anchor: "APPOINTMENT", offsetMinutes: -2880, fixedTime: "18:00", eligibleStatuses: ["SCHEDULED", "CONFIRMED"], action: "REMINDER" },
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", action: "REQUEST_CONFIRMATION" },
    { anchor: "APPOINTMENT", offsetMinutes: -180, action: "REQUEST_CONFIRMATION" },
  ]);
  typeId = (await createTypeWithCadence(fixture.practiceId, "Consulta com régua", cadence.id)).id;
  secretary = await contextAs(fixture, "SECRETARY");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function book(patientId: string, date: string, time = "10:00", appointmentTypeId = typeId) {
  const { id } = await createAppointment(secretary, {
    patientId,
    professionalId: fixture.professionals.ana.id,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId,
    date,
    time,
  });
  return id;
}

describe("planning when booking", () => {
  it("plans every step at its time, on the professional's instance, with the cadence version", async () => {
    const patient = await createPatient(fixture.practiceId);
    const date = dayAhead(10);
    const before = Date.now();
    const id = await book(patient.id, date);
    const dispatches = await dispatchesOf(fixture.practiceId, id);

    expect(dispatches.map((row) => [row.cadenceStep?.position, row.status])).toEqual([
      [1, "SCHEDULED"],
      [2, "SCHEDULED"],
      [3, "SCHEDULED"],
      [4, "SCHEDULED"],
    ]);
    expect(dispatches[0].scheduledFor.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(dispatches[0].scheduledFor.getTime()).toBeLessThanOrEqual(Date.now());
    expect(dispatches.slice(1).map((row) => row.scheduledFor)).toEqual([
      zonedToUtc(dayAhead(8), "18:00", TZ),
      zonedToUtc(dayAhead(9), "18:00", TZ),
      zonedToUtc(date, "07:00", TZ),
    ]);
    expect(dispatches.every((row) => row.whatsappInstanceId === instanceId && row.cadenceVersion === 1 && !row.manual)).toBe(true);
  });

  it("records a step already past at booking as skipped", async () => {
    const patient = await createPatient(fixture.practiceId);
    const id = await book(patient.id, dayAhead(1), "22:00");
    const dispatches = await dispatchesOf(fixture.practiceId, id);
    expect(dispatches.find((row) => row.cadenceStep?.position === 2)).toMatchObject({ status: "SKIPPED", statusReason: "passed" });
  });

  it("leaves out a patient without consent, or who refused it (D-47)", async () => {
    const unknown = await createPatient(fixture.practiceId, { consent: null });
    const refused = await createPatient(fixture.practiceId, { consent: false });
    expect(await dispatchesOf(fixture.practiceId, await book(unknown.id, dayAhead(10), "11:00"))).toEqual([]);
    expect(await dispatchesOf(fixture.practiceId, await book(refused.id, dayAhead(10), "12:00"))).toEqual([]);
  });

  it("leaves out a professional the cadence does not cover", async () => {
    const onlyBruno = await createCadence(fixture.practiceId, "Só Bruno", [{ anchor: "BOOKING", action: "REMINDER" }], {
      professionalIds: [fixture.professionals.bruno.id],
    });
    const type = await createTypeWithCadence(fixture.practiceId, "Tipo só Bruno", onlyBruno.id);
    const patient = await createPatient(fixture.practiceId);
    expect(await dispatchesOf(fixture.practiceId, await book(patient.id, dayAhead(10), "13:00", type.id))).toEqual([]);
  });

  it("starts an imported appointment with the cadence off and plans it when the manager turns it on (D-18)", async () => {
    const patient = await createPatient(fixture.practiceId);
    const { id } = await importAppointment(manager, {
      patientId: patient.id,
      professionalId: fixture.professionals.ana.id,
      locationId: fixture.locations.aldeota.id,
      appointmentTypeId: typeId,
      date: dayAhead(12),
      time: "10:00",
      status: "SCHEDULED",
    });
    expect(await dispatchesOf(fixture.practiceId, id)).toEqual([]);

    await enableImportedCadence(manager, { professionalId: fixture.professionals.ana.id });
    const dispatches = await dispatchesOf(fixture.practiceId, id);
    expect(dispatches.map((row) => row.status)).toEqual(["SCHEDULED", "SCHEDULED", "SCHEDULED", "SCHEDULED"]);
  });
});

describe("status changes (D-06)", () => {
  it("ends only the confirmation requests on confirmation; reminders eligible for Confirmado go on", async () => {
    const patient = await createPatient(fixture.practiceId);
    const id = await book(patient.id, dayAhead(10), "14:00");
    await changeAppointmentStatus(secretary, { appointmentId: id, to: "CONFIRMED" });
    const dispatches = await dispatchesOf(fixture.practiceId, id);
    expect(dispatches.map((row) => [row.cadenceStep?.position, row.status, row.statusReason])).toEqual([
      [1, "CANCELED", "confirmed"],
      [2, "SCHEDULED", null],
      [3, "CANCELED", "confirmed"],
      [4, "CANCELED", "confirmed"],
    ]);
  });

  it("ends the whole cadence on cancellation and resolves the cadence flags", async () => {
    const patient = await createPatient(fixture.practiceId);
    const id = await book(patient.id, dayAhead(10), "15:00");
    await forPractice(fixture.practiceId).appointmentFlag.create({ data: { practiceId: fixture.practiceId, appointmentId: id, type: "NO_CONFIRMATION" } });
    await changeAppointmentStatus(secretary, { appointmentId: id, to: "CANCELED_BY_PATIENT" });

    const dispatches = await dispatchesOf(fixture.practiceId, id);
    expect(dispatches.every((row) => row.status === "CANCELED" && row.statusReason === "canceled")).toBe(true);
    const flags = await forPractice(fixture.practiceId).appointmentFlag.findMany({ where: { appointmentId: id } });
    expect(flags.every((flag) => flag.resolvedAt !== null)).toBe(true);
  });

  it("restarts the cadence on the rescheduled appointment and ends it on the original (D-11)", async () => {
    const patient = await createPatient(fixture.practiceId);
    const original = await book(patient.id, dayAhead(10), "16:00");
    const { id } = await rescheduleAppointment(secretary, { appointmentId: original, date: dayAhead(14), time: "16:00" });

    const old = await dispatchesOf(fixture.practiceId, original);
    expect(old.every((row) => row.status === "CANCELED" && row.statusReason === "rescheduled")).toBe(true);
    const restarted = await dispatchesOf(fixture.practiceId, id);
    expect(restarted.map((row) => row.status)).toEqual(["SCHEDULED", "SCHEDULED", "SCHEDULED", "SCHEDULED"]);
    expect(restarted[3].scheduledFor).toEqual(zonedToUtc(dayAhead(14), "13:00", TZ));
  });
});

describe("consent changes (D-47)", () => {
  it("cancels the scheduled dispatches on revocation and plans again when consent comes back", async () => {
    const patient = await createPatient(fixture.practiceId);
    const id = await book(patient.id, dayAhead(10), "17:00");
    await recordConsent(secretary, { patientId: patient.id, granted: false, channel: "PHONE" });
    expect((await dispatchesOf(fixture.practiceId, id)).every((row) => row.status === "CANCELED" && row.statusReason === "consent_revoked")).toBe(true);

    await recordConsent(secretary, { patientId: patient.id, granted: true, channel: "PHONE" });
    const scheduled = (await dispatchesOf(fixture.practiceId, id)).filter((row) => row.status === "SCHEDULED");
    expect(scheduled.map((row) => row.cadenceStep?.position).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("cadence versions (PRD 6, rule 7)", () => {
  it("keeps the dispatches of the next 24 h and replans the rest with the new version", async () => {
    const cadence = await createCadence(fixture.practiceId, "Relativa", [
      { anchor: "APPOINTMENT", offsetMinutes: -36 * 60, action: "REMINDER" },
      { anchor: "APPOINTMENT", offsetMinutes: -12 * 60, action: "REMINDER" },
    ]);
    const type = await createTypeWithCadence(fixture.practiceId, "Tipo relativo", cadence.id);
    const patient = await createPatient(fixture.practiceId);
    const slot = localSlot(40 * 60);
    const id = await book(patient.id, slot.date, slot.time, type.id);
    expect((await dispatchesOf(fixture.practiceId, id)).map((row) => row.status)).toEqual(["SCHEDULED", "SCHEDULED"]);

    const db = forPractice(fixture.practiceId);
    await db.cadence.update({ where: { id: cadence.id }, data: { version: 2 } });
    await db.cadenceStep.createMany({
      data: [
        { practiceId: fixture.practiceId, cadenceId: cadence.id, cadenceVersion: 2, position: 1, anchor: "APPOINTMENT", offsetMinutes: -30 * 60, eligibleStatuses: ["SCHEDULED"], action: "REMINDER", template: "v2 passo 1" },
        { practiceId: fixture.practiceId, cadenceId: cadence.id, cadenceVersion: 2, position: 2, anchor: "APPOINTMENT", offsetMinutes: -6 * 60, eligibleStatuses: ["SCHEDULED"], action: "REMINDER", template: "v2 passo 2" },
      ],
    });
    await replanAppointments(db, { appointmentTypeId: type.id }, new Date());

    const dispatches = await dispatchesOf(fixture.practiceId, id);
    expect(dispatches.map((row) => [row.cadenceStep?.cadenceVersion, row.cadenceStep?.position, row.status, row.statusReason])).toEqual([
      [1, 1, "SCHEDULED", null],
      [1, 2, "CANCELED", "cadence_changed"],
      [2, 2, "SCHEDULED", null],
    ]);
  });
});
