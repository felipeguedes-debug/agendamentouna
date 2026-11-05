import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import {
  changeAppointmentStatus,
  createAppointment,
  getAppointmentDetail,
  rescheduleAppointment,
  type CreateAppointmentInput,
} from "./appointments";

// Booking, status changes and rescheduling (PRD 4; D-11, D-12, D-43, D-44).

let fixture: AgendaFixture;
let secretary: PracticeContext;
let manager: PracticeContext;
let ana: PracticeContext;

// Each test books on its own day, so conflicts only come from the test itself.
let nextDay = 0;
function freshDate() {
  nextDay += 1;
  const date = new Date(Date.UTC(2027, 0, 1) + nextDay * 86_400_000);
  return date.toISOString().slice(0, 10);
}

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Agendamentos");
  secretary = await contextAs(fixture, "SECRETARY");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
  ana = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
});

afterAll(async () => {
  await prisma.$disconnect();
});

function booking(overrides: Partial<CreateAppointmentInput> = {}): CreateAppointmentInput {
  return {
    patientId: fixture.patient.id,
    professionalId: fixture.professionals.ana.id,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: fixture.types.consultation.id,
    date: freshDate(),
    time: "08:00",
    ...overrides,
  };
}

async function statusOf(id: string) {
  return (await fixture.db.appointment.findUniqueOrThrow({ where: { id } })).status;
}

describe("createAppointment", () => {
  it("copies duration and price from the type, in the location's time zone, with history and audit (D-12)", async () => {
    const { id } = await createAppointment(secretary, booking({ date: "2027-03-02", time: "08:00", leadSource: "INSTAGRAM", internalNote: "Prefere manhã" }));
    const appointment = await fixture.db.appointment.findUniqueOrThrow({ where: { id } });
    expect(appointment).toMatchObject({
      startsAt: new Date("2027-03-02T11:00:00Z"),
      endsAt: new Date("2027-03-02T11:30:00Z"),
      durationMinutes: 30,
      priceCents: 45000,
      status: "SCHEDULED",
      insurance: "Particular",
      leadSource: "INSTAGRAM",
      internalNote: "Prefere manhã",
      createdByUserId: secretary.user.id,
    });
    const history = await fixture.db.appointmentStatusChange.findMany({ where: { appointmentId: id } });
    expect(history).toEqual([
      expect.objectContaining({ fromStatus: null, toStatus: "SCHEDULED", source: "USER", changedByUserId: secretary.user.id }),
    ]);
    const audit = await fixture.db.auditEvent.findMany({ where: { entityId: id } });
    expect(audit).toEqual([expect.objectContaining({ action: "appointment.created", entityType: "Appointment", changedFields: [] })]);
  });

  it("uses the location's own time zone", async () => {
    const { id } = await createAppointment(secretary, booking({ locationId: fixture.locations.manaus.id, date: "2027-03-03", time: "08:00" }));
    expect((await fixture.db.appointment.findUniqueOrThrow({ where: { id } })).startsAt).toEqual(new Date("2027-03-03T12:00:00Z"));
  });

  it("uses the professional's price for the type when there is one", async () => {
    await fixture.db.appointmentTypePrice.create({
      data: { practiceId: fixture.practiceId, appointmentTypeId: fixture.types.procedure.id, professionalId: fixture.professionals.bruno.id, priceCents: 70000 },
    });
    const { id } = await createAppointment(
      secretary,
      booking({ professionalId: fixture.professionals.bruno.id, appointmentTypeId: fixture.types.procedure.id }),
    );
    expect(await fixture.db.appointment.findUniqueOrThrow({ where: { id } })).toMatchObject({ priceCents: 70000, durationMinutes: 40 });
  });

  it("lets anyone who books change the duration, but only the manager change the price", async () => {
    const { id } = await createAppointment(secretary, booking({ durationMinutes: 50 }));
    expect(await fixture.db.appointment.findUniqueOrThrow({ where: { id } })).toMatchObject({ durationMinutes: 50 });
    await expect(createAppointment(secretary, booking({ priceCents: 1 }))).rejects.toMatchObject({ code: "not_allowed" });
    const managed = await createAppointment(manager, booking({ priceCents: 0 }));
    expect(await fixture.db.appointment.findUniqueOrThrow({ where: { id: managed.id } })).toMatchObject({ priceCents: 0 });
  });

  it("checks that professional, location, type and patient belong together and to the practice", async () => {
    const other = await createAgendaFixture("Consultório Agendamentos Outro");
    await expect(createAppointment(secretary, booking({ locationId: fixture.locations.manaus.id, professionalId: fixture.professionals.bruno.id }))).rejects.toMatchObject({ code: "location_unavailable" });
    await expect(createAppointment(secretary, booking({ patientId: other.patient.id }))).rejects.toMatchObject({ code: "patient_unavailable" });
    await expect(createAppointment(secretary, booking({ professionalId: other.professionals.ana.id }))).rejects.toMatchObject({ code: "professional_unavailable" });
    await expect(createAppointment(secretary, booking({ appointmentTypeId: other.types.consultation.id }))).rejects.toMatchObject({ code: "type_unavailable" });
    await expect(createAppointment(secretary, booking({ date: "2027-02-30" }))).rejects.toMatchObject({ code: "invalid_date" });
    await expect(createAppointment(secretary, booking({ durationMinutes: 0 }))).rejects.toMatchObject({ code: "invalid_duration" });
  });

  it("is refused to the professional, who only sees the agenda", async () => {
    await expect(createAppointment(ana, booking())).rejects.toMatchObject({ code: "not_allowed" });
  });

  it("blocks an overlapping booking and lets the manager overbook (rule 3)", async () => {
    const date = freshDate();
    await createAppointment(secretary, booking({ date, time: "09:00" }));
    const error = await createAppointment(secretary, booking({ date, time: "09:15" })).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "conflict", details: ["09:00–09:30 · Maria Souza"] });
    await expect(createAppointment(secretary, booking({ date, time: "09:15", allowConflict: true }))).rejects.toMatchObject({ code: "not_allowed" });
    await expect(createAppointment(manager, booking({ date, time: "09:15", allowConflict: true }))).resolves.toMatchObject({ overbooked: true });
    // Back to back is not a conflict, and another professional is free.
    await expect(createAppointment(secretary, booking({ date, time: "09:45" }))).resolves.toMatchObject({ overbooked: false });
    await expect(createAppointment(secretary, booking({ date, time: "09:00", professionalId: fixture.professionals.bruno.id }))).resolves.toBeDefined();
  });

  it("treats a time block as a conflict and a canceled appointment as free", async () => {
    const date = freshDate();
    await fixture.db.timeBlock.create({
      data: {
        practiceId: fixture.practiceId,
        professionalId: fixture.professionals.ana.id,
        startsAt: new Date(`${date}T17:00:00Z`),
        endsAt: new Date(`${date}T21:00:00Z`),
        reason: "Cirurgia",
      },
    });
    await expect(createAppointment(secretary, booking({ date, time: "15:00" }))).rejects.toMatchObject({ code: "conflict", details: ["14:00–18:00 · Bloqueio: Cirurgia"] });

    const { id } = await createAppointment(secretary, booking({ date, time: "08:00" }));
    await changeAppointmentStatus(secretary, { appointmentId: id, to: "CANCELED_BY_PATIENT" });
    await expect(createAppointment(secretary, booking({ date, time: "08:00" }))).resolves.toBeDefined();
  });

  it("lets only one of two simultaneous bookings take the same slot", async () => {
    const date = freshDate();
    const results = await Promise.allSettled([
      createAppointment(secretary, booking({ date, time: "10:00" })),
      createAppointment(manager, booking({ date, time: "10:00" })),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "conflict" });
  });
});

describe("changeAppointmentStatus", () => {
  it("follows the flow and records author, time and audit with field names only", async () => {
    const { id } = await createAppointment(secretary, booking());
    await changeAppointmentStatus(secretary, { appointmentId: id, to: "CONFIRMED" });
    await changeAppointmentStatus(ana, { appointmentId: id, to: "ARRIVED" });
    await changeAppointmentStatus(ana, { appointmentId: id, to: "IN_PROGRESS" });
    await changeAppointmentStatus(ana, { appointmentId: id, to: "COMPLETED" });

    const history = await fixture.db.appointmentStatusChange.findMany({ where: { appointmentId: id }, orderBy: { changedAt: "asc" } });
    expect(history.map((change) => [change.fromStatus, change.toStatus, change.changedByUserId])).toEqual([
      [null, "SCHEDULED", secretary.user.id],
      ["SCHEDULED", "CONFIRMED", secretary.user.id],
      ["CONFIRMED", "ARRIVED", ana.user.id],
      ["ARRIVED", "IN_PROGRESS", ana.user.id],
      ["IN_PROGRESS", "COMPLETED", ana.user.id],
    ]);
    const audit = await fixture.db.auditEvent.findMany({ where: { entityId: id, action: "appointment.status_changed" } });
    expect(audit).toHaveLength(4);
    expect(audit.every((event) => event.changedFields.join() === "status" && event.entityType === "Appointment")).toBe(true);
  });

  it("refuses transitions outside the table", async () => {
    const { id } = await createAppointment(secretary, booking());
    await expect(changeAppointmentStatus(secretary, { appointmentId: id, to: "COMPLETED" })).rejects.toMatchObject({ code: "invalid_transition" });
    await expect(changeAppointmentStatus(secretary, { appointmentId: id, to: "RESCHEDULED" })).rejects.toMatchObject({ code: "invalid_transition" });
    expect(await statusOf(id)).toBe("SCHEDULED");
  });

  it("keeps the professional to their own appointments", async () => {
    const { id } = await createAppointment(secretary, booking({ professionalId: fixture.professionals.bruno.id }));
    await expect(changeAppointmentStatus(ana, { appointmentId: id, to: "ARRIVED" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("lets only the manager correct a final status, with a reason", async () => {
    const { id } = await createAppointment(secretary, booking());
    await changeAppointmentStatus(secretary, { appointmentId: id, to: "NO_SHOW" });
    await expect(changeAppointmentStatus(secretary, { appointmentId: id, to: "CANCELED_BY_PATIENT", reason: "Avisou" })).rejects.toMatchObject({ code: "not_allowed" });
    await expect(changeAppointmentStatus(manager, { appointmentId: id, to: "CANCELED_BY_PATIENT", reason: "  " })).rejects.toMatchObject({ code: "reason_required" });
    await changeAppointmentStatus(manager, { appointmentId: id, to: "CANCELED_BY_PATIENT", reason: "Avisou por telefone" });
    const last = await fixture.db.appointmentStatusChange.findFirst({ where: { appointmentId: id }, orderBy: { changedAt: "desc" } });
    expect(last).toMatchObject({ fromStatus: "NO_SHOW", toStatus: "CANCELED_BY_PATIENT", reason: "Avisou por telefone" });
  });

  it("refuses a change made on a stale status", async () => {
    const { id } = await createAppointment(secretary, booking());
    await changeAppointmentStatus(secretary, { appointmentId: id, to: "CONFIRMED" });
    await expect(changeAppointmentStatus(manager, { appointmentId: id, from: "SCHEDULED", to: "CANCELED_BY_PRACTICE" })).rejects.toMatchObject({ code: "status_changed" });
    expect(await statusOf(id)).toBe("CONFIRMED");
  });

  it("does not find an appointment of another practice", async () => {
    const other = await createAgendaFixture("Consultório Agendamentos Isolado");
    const otherSecretary = await contextAs(other, "SECRETARY");
    const { id } = await createAppointment(otherSecretary, {
      patientId: other.patient.id,
      professionalId: other.professionals.ana.id,
      locationId: other.locations.aldeota.id,
      appointmentTypeId: other.types.consultation.id,
      date: "2027-04-01",
      time: "08:00",
    });
    await expect(changeAppointmentStatus(secretary, { appointmentId: id, to: "CONFIRMED" })).rejects.toMatchObject({ code: "not_found" });
    expect(await getAppointmentDetail(secretary, id)).toBeNull();
  });

  it("takes IMPORT as the source only for the importer and only on a freshly imported appointment (D-48)", async () => {
    const { id } = await createAppointment(secretary, booking());
    await expect(changeAppointmentStatus(secretary, { appointmentId: id, to: "COMPLETED", source: "IMPORT" })).rejects.toMatchObject({ code: "not_allowed" });
    await expect(changeAppointmentStatus(manager, { appointmentId: id, to: "COMPLETED", source: "IMPORT" })).rejects.toMatchObject({ code: "not_allowed" });
    expect(await statusOf(id)).toBe("SCHEDULED");
  });
});

describe("rescheduleAppointment (D-11)", () => {
  it("creates a new appointment linked to the original, which becomes Reagendado", async () => {
    const original = await createAppointment(manager, booking({ priceCents: 39000, durationMinutes: 45, internalNote: "Nota" }));
    await changeAppointmentStatus(secretary, { appointmentId: original.id, to: "CONFIRMED" });
    const date = freshDate();
    const { id } = await rescheduleAppointment(secretary, {
      appointmentId: original.id,
      date,
      time: "14:00",
      professionalId: fixture.professionals.bruno.id,
      locationId: fixture.locations.aldeota.id,
    });

    expect(await statusOf(original.id)).toBe("RESCHEDULED");
    const created = await fixture.db.appointment.findUniqueOrThrow({ where: { id } });
    expect(created).toMatchObject({
      rescheduledFromId: original.id,
      status: "SCHEDULED",
      professionalId: fixture.professionals.bruno.id,
      patientId: fixture.patient.id,
      priceCents: 39000,
      durationMinutes: 45,
      internalNote: "Nota",
      startsAt: new Date(`${date}T17:00:00Z`),
    });
    const originalHistory = await fixture.db.appointmentStatusChange.findMany({ where: { appointmentId: original.id }, orderBy: { changedAt: "asc" } });
    expect(originalHistory.map((change) => change.toStatus)).toEqual(["SCHEDULED", "CONFIRMED", "RESCHEDULED"]);
    const detail = await getAppointmentDetail(secretary, original.id);
    expect(detail?.rescheduledTo).toEqual([expect.objectContaining({ id })]);
    expect((await getAppointmentDetail(secretary, id))?.rescheduledFrom).toMatchObject({ id: original.id });
  });

  it("may keep the same time slot, since the original frees it", async () => {
    const date = freshDate();
    const original = await createAppointment(secretary, booking({ date, time: "08:00" }));
    await expect(rescheduleAppointment(secretary, { appointmentId: original.id, date, time: "08:15" })).resolves.toBeDefined();
  });

  it("checks conflicts at the new time", async () => {
    const date = freshDate();
    await createAppointment(secretary, booking({ date, time: "11:00" }));
    const original = await createAppointment(secretary, booking({ time: "08:00" }));
    await expect(rescheduleAppointment(secretary, { appointmentId: original.id, date, time: "11:00" })).rejects.toMatchObject({ code: "conflict" });
    expect(await statusOf(original.id)).toBe("SCHEDULED");
  });

  it("only moves Agendado or Confirmado, and Reagendado never moves again", async () => {
    const { id } = await createAppointment(secretary, booking());
    const moved = await rescheduleAppointment(secretary, { appointmentId: id, date: freshDate(), time: "08:00" });
    await expect(rescheduleAppointment(secretary, { appointmentId: id, date: freshDate(), time: "08:00" })).rejects.toMatchObject({ code: "invalid_transition" });
    for (const to of ["CONFIRMED", "CANCELED_BY_PATIENT"] satisfies AppointmentStatus[]) {
      await expect(changeAppointmentStatus(manager, { appointmentId: id, to, reason: "x" })).rejects.toMatchObject({ code: "invalid_transition" });
    }
    await changeAppointmentStatus(secretary, { appointmentId: moved.id, to: "ARRIVED" });
    await expect(rescheduleAppointment(secretary, { appointmentId: moved.id, date: freshDate(), time: "08:00" })).rejects.toMatchObject({ code: "invalid_transition" });
  });

  it("is refused to the professional", async () => {
    const { id } = await createAppointment(secretary, booking());
    await expect(rescheduleAppointment(ana, { appointmentId: id, date: freshDate(), time: "08:00" })).rejects.toMatchObject({ code: "not_allowed" });
  });
});

describe("getAppointmentDetail", () => {
  it("shows the history with author names", async () => {
    const { id } = await createAppointment(secretary, booking());
    await changeAppointmentStatus(secretary, { appointmentId: id, to: "CONFIRMED" });
    const detail = await getAppointmentDetail(manager, id);
    expect(detail).toMatchObject({ patient: { name: "Maria Souza" }, professional: { name: "Dra. Ana Teste" }, status: "CONFIRMED" });
    expect(detail?.history.map((entry) => [entry.toStatus, entry.authorName])).toEqual([
      ["SCHEDULED", secretary.user.name],
      ["CONFIRMED", secretary.user.name],
    ]);
  });

  it("names an organization admin who has no membership", async () => {
    const admin = await contextAs(fixture, "ORG_ADMIN");
    const { id } = await createAppointment(admin, booking());
    expect((await getAppointmentDetail(secretary, id))?.history[0].authorName).toBe("Admin da organização");
  });

  it("hides other professionals' appointments from a professional", async () => {
    const own = await createAppointment(secretary, booking());
    const others = await createAppointment(secretary, booking({ professionalId: fixture.professionals.bruno.id }));
    expect(await getAppointmentDetail(ana, own.id)).not.toBeNull();
    expect(await getAppointmentDetail(ana, others.id)).toBeNull();
  });
});
