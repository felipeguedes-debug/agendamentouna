import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { forPractice, prisma } from "@/lib/db";
import { addInstance } from "../../../tests/helpers/cadence";
import { connectCrm } from "../../../tests/helpers/crm";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { createPractice } from "../../../tests/helpers/auth";
import { loadOrganizationHealth, loadPracticeHealth, type PracticeHealth } from "./health";

// The internal panel of PRD 7 (D-101): delivery of WhatsApp, sync failures and errors per
// practice. The numbers below are counted by hand from the rows this file creates.

const NOW = new Date("2026-11-10T15:00:00Z");
const DAY_MS = 86_400_000;
const PERIOD = { start: "2026-11-04", endExclusive: "2026-11-11" };
const INSIDE = new Date(NOW.getTime() - 2 * DAY_MS);
const OUTSIDE = new Date(NOW.getTime() - 20 * DAY_MS);

let fixture: AgendaFixture;
let db: ReturnType<typeof forPractice>;
let health: PracticeHealth;

async function appointment(startsAt: Date, extra: object = {}) {
  return db.appointment.create({
    data: {
      practiceId: fixture.practiceId,
      patientId: fixture.patient.id,
      professionalId: fixture.professionals.ana.id,
      locationId: fixture.locations.aldeota.id,
      appointmentTypeId: fixture.types.consultation.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 1_800_000),
      durationMinutes: 30,
      priceCents: 0,
      ...extra,
    },
  });
}

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Saúde");
  db = fixture.db;
  const { practiceId } = fixture;
  const instance = await addInstance(practiceId, fixture.professionals.ana.id);
  await db.whatsappInstance.update({ where: { id: instance.id }, data: { status: "CONNECTED" } });
  const third = await db.professional.create({ data: { practiceId, name: "Dra. Desconectada" } });
  const thirdInstance = await addInstance(practiceId, third.id);
  await db.whatsappInstance.update({ where: { id: thirdInstance.id }, data: { status: "DISCONNECTED" } });
  // Dr. Bruno has no instance, so 3 active professionals: 1 connected, 1 not, 1 with none.

  const booked = await appointment(INSIDE);
  const dispatch = (data: object) => db.dispatch.create({ data: { practiceId, appointmentId: booked.id, whatsappInstanceId: instance.id, scheduledFor: INSIDE, ...data } });
  // Sent in the period: 4, of which delivered or read 3.
  await dispatch({ status: "DELIVERED", sentAt: INSIDE });
  await dispatch({ status: "DELIVERED", sentAt: INSIDE });
  await dispatch({ status: "READ", sentAt: INSIDE });
  await dispatch({ status: "SENT", sentAt: INSIDE });
  // Failed without leaving: 3, 2 for one reason and 1 for another; and one out of the period.
  await dispatch({ status: "FAILED", statusReason: "instance_disconnected" });
  await dispatch({ status: "FAILED", statusReason: "instance_disconnected" });
  await dispatch({ status: "FAILED", statusReason: "no_instance" });
  await dispatch({ status: "FAILED", statusReason: "no_instance", scheduledFor: OUTSIDE });

  // Google: reached 4, 1 with an error; 1 waiting; 1 error out of the period.
  await appointment(new Date(INSIDE.getTime() + 3_600_000), { googleSyncedAt: INSIDE });
  await appointment(new Date(INSIDE.getTime() + 7_200_000), { googleSyncedAt: INSIDE });
  await appointment(new Date(INSIDE.getTime() + 10_800_000), { googleSyncedAt: INSIDE, googleSyncRequestedAt: INSIDE });
  await appointment(new Date(INSIDE.getTime() + 14_400_000), { googleSyncError: "falhou", crmSyncError: "falhou", crmSyncRequestedAt: INSIDE });
  await appointment(OUTSIDE, { googleSyncError: "falhou" });

  // The CRM's marks are about now, with no period: 2 failures (1 above, 1 here) and 2 waiting.
  await db.patient.update({ where: { id: fixture.patient.id }, data: { crmSyncError: "falhou", crmSyncRequestedAt: INSIDE } });
  await connectCrm(practiceId);

  // Server errors: 3 in the period, on 2 routes; 1 out of it.
  const serverError = (route: string, occurredAt: Date) => db.serverError.create({ data: { practiceId, source: "render", route, errorName: "TypeError", occurredAt } });
  await serverError("/conta/[practiceId]/regua", INSIDE);
  await serverError("/conta/[practiceId]/regua", new Date(INSIDE.getTime() + 60_000));
  await serverError("/conta/[practiceId]/pacientes", INSIDE);
  await serverError("/conta/[practiceId]/pacientes", OUTSIDE);

  health = await loadPracticeHealth(db, PERIOD);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("loadPracticeHealth", () => {
  it("counts WhatsApp's delivery as the indicators do (D-74): delivered ÷ sent, and what never left apart", () => {
    expect(health.delivery.rate).toEqual({ numerator: 3, denominator: 4, value: 0.75 });
    expect(health.delivery.neverSent).toBe(3);
  });

  it("says why the messages failed, most frequent first", () => {
    expect(health.dispatchFailures).toEqual([
      { reason: "instance_disconnected", count: 2 },
      { reason: "no_instance", count: 1 },
    ]);
  });

  it("gives the situation of the instances", () => {
    expect(health.instances).toEqual({ professionals: 3, connected: 1, notConnected: 1, withoutInstance: 1 });
  });

  it("counts Google's sync failures in the period, and what is waiting now", () => {
    expect(health.google.failures).toEqual({ numerator: 1, denominator: 4, value: 0.25 });
    expect(health.google.waiting).toBe(1);
    expect(health.google.revokedLinks).toBe(0);
  });

  it("counts the CRM's failures and queue, and the account's situation", () => {
    expect(health.crm).toMatchObject({ status: "active", failed: 2, waiting: 2 });
  });

  it("groups the server errors of the period by route, most frequent first", () => {
    expect(health.serverErrors.total).toBe(3);
    expect(health.serverErrors.groups).toEqual([
      expect.objectContaining({ source: "render", route: "/conta/[practiceId]/regua", errorName: "TypeError", count: 2 }),
      expect.objectContaining({ source: "render", route: "/conta/[practiceId]/pacientes", errorName: "TypeError", count: 1 }),
    ]);
  });

  it("with nothing to count says so with a null, never an invented zero (D-75)", async () => {
    const { practiceId } = await createPractice("Consultório Vazio");
    const empty = await loadPracticeHealth(forPractice(practiceId), PERIOD);
    expect(empty.delivery.rate.value).toBeNull();
    expect(empty.google.failures.value).toBeNull();
    expect(empty.crm.status).toBe("none");
    expect(empty.serverErrors).toEqual({ total: 0, groups: [] });
    expect(empty.instances).toEqual({ professionals: 0, connected: 0, notConnected: 0, withoutInstance: 0 });
  });

  it("sees only its own practice", async () => {
    const other = await createAgendaFixture("Consultório Vizinho Saúde");
    const otherHealth = await loadPracticeHealth(other.db, PERIOD);
    expect(otherHealth.serverErrors.total).toBe(0);
    expect(otherHealth.delivery.rate.denominator).toBe(0);
  });
});

describe("loadOrganizationHealth", () => {
  let admin: PracticeContext;

  beforeAll(async () => {
    admin = await contextAs(fixture, "ORG_ADMIN");
  });

  it("brings every practice of the admin's organization, and no other", async () => {
    await createPractice("Clínica Irmã Saúde", { organizationId: fixture.organizationId });
    await createPractice("Clínica de Fora Saúde");
    const { practices } = await loadOrganizationHealth(admin, PERIOD);
    expect(practices.map((row) => row.name)).toEqual(["Clínica Irmã Saúde", "Consultório Saúde"]);
    expect(practices.find((row) => row.name === "Consultório Saúde")?.health.serverErrors.total).toBe(3);
  });

  it("is the admin's alone", async () => {
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    await expect(loadOrganizationHealth(manager, PERIOD)).rejects.toMatchObject({ code: "not_allowed" });
  });
});
