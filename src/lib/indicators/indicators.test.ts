import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPracticeAccess, practiceContext } from "@/lib/auth/access";
import { forPractice, prisma } from "@/lib/db";
import { addMember, addOrganizationAdmin, createPractice, createUser } from "../../../tests/helpers/auth";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { loadIndicators, loadOrganizationIndicators, recordConfirmationWorkMinute } from "./indicators";

// The queries behind the panel of PRD 8: who may read, whose rows, which day (D-74, D-75).
// The arithmetic is tested by hand in rules.test.ts and seed.test.ts.

const NOW = new Date("2026-10-25T15:00:00-03:00");
const WEEK = { start: "2026-10-19", endExclusive: "2026-10-26" };

let fixture: AgendaFixture;

async function appointment(target: AgendaFixture, startsAt: string, status: "COMPLETED" | "NO_SHOW" | "CONFIRMED", location = target.locations.aldeota) {
  const start = new Date(startsAt);
  return target.db.appointment.create({
    data: {
      practiceId: target.practiceId,
      locationId: location.id,
      professionalId: target.professionals.ana.id,
      patientId: target.patient.id,
      appointmentTypeId: target.types.consultation.id,
      startsAt: start,
      endsAt: new Date(start.getTime() + 30 * 60_000),
      durationMinutes: 30,
      priceCents: 10000,
      status,
    },
  });
}

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Indicadores");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("loadIndicators", () => {
  it("is for whoever has reports:practice", async () => {
    await expect(loadIndicators(await contextAs(fixture, "SECRETARY"), WEEK, NOW)).rejects.toMatchObject({ code: "not_allowed" });
    await expect(loadIndicators(await contextAs(fixture, "PROFESSIONAL"), WEEK, NOW)).rejects.toMatchObject({ code: "not_allowed" });
    await expect(loadIndicators(await contextAs(fixture, "PRACTICE_MANAGER"), WEEK, NOW)).resolves.toBeDefined();
    await expect(loadIndicators(await contextAs(fixture, "ORG_ADMIN"), WEEK, NOW)).resolves.toBeDefined();
  });

  it("puts each appointment on the day of its own location", async () => {
    const target = await createAgendaFixture("Consultório Dois Fusos");
    const manager = await contextAs(target, "PRACTICE_MANAGER");
    // 00:30 of the period's first day in Fortaleza is 23:30 of the day before in Manaus.
    await appointment(target, "2026-10-19T00:30:00-03:00", "NO_SHOW", target.locations.manaus);
    await appointment(target, "2026-10-19T00:30:00-03:00", "COMPLETED", target.locations.aldeota);
    const { noShow } = await loadIndicators(manager, WEEK, NOW);
    expect(noShow).toMatchObject({ completed: 1, noShow: 0 });
  });

  it("treats as Sem baixa only what is before today at its own location", async () => {
    const target = await createAgendaFixture("Consultório Sem Baixa");
    const manager = await contextAs(target, "PRACTICE_MANAGER");
    await appointment(target, "2026-10-24T09:00:00-03:00", "CONFIRMED");
    await appointment(target, "2026-10-25T09:00:00-03:00", "CONFIRMED"); // today, 15:00
    expect((await loadIndicators(manager, WEEK, NOW)).noShow.withoutClosing).toBe(1);
  });

  it("does not read another practice's rows", async () => {
    const mine = await createAgendaFixture("Consultório Meu");
    const other = await createAgendaFixture("Consultório Vizinho");
    await appointment(other, "2026-10-20T09:00:00-03:00", "NO_SHOW");
    await appointment(mine, "2026-10-20T09:00:00-03:00", "COMPLETED");
    const { noShow } = await loadIndicators(await contextAs(mine, "PRACTICE_MANAGER"), WEEK, NOW);
    expect(noShow).toMatchObject({ completed: 1, noShow: 0 });
  });

  it("says nobody ever used the practice instead of zero days", async () => {
    const target = await createAgendaFixture("Consultório Sem Uso");
    const { adoption } = await loadIndicators(await contextAs(target, "PRACTICE_MANAGER"), WEEK, NOW);
    expect(adoption.days).toBeNull();
    await target.db.auditEvent.create({
      data: { practiceId: target.practiceId, actorType: "USER", occurredAt: new Date("2026-09-01T12:00:00Z"), action: "appointment.created", entityType: "Appointment", changedFields: [] },
    });
    // Used before, but not in that week: now zero is the truth.
    expect((await loadIndicators(await contextAs(target, "PRACTICE_MANAGER"), WEEK, NOW)).adoption.days).toBe(0);
  });

  it("does not count as use what the patient or the CRM did", async () => {
    const target = await createAgendaFixture("Consultório Sem Ação");
    await target.db.auditEvent.create({
      data: { practiceId: target.practiceId, actorType: "PATIENT", occurredAt: new Date("2026-10-14T12:00:00Z"), action: "appointment.status_changed", entityType: "Appointment", changedFields: [] },
    });
    expect((await loadIndicators(await contextAs(target, "PRACTICE_MANAGER"), WEEK, NOW)).adoption.days).toBeNull();
  });
});

describe("loadOrganizationIndicators", () => {
  it("is only for the organization admin, who sees that organization alone", async () => {
    const { organizationId, practiceId } = await createPractice("Org A · Conta 1");
    const { practiceId: secondId } = await createPractice("Org A · Conta 2", { organizationId });
    const { practiceId: foreignId } = await createPractice("Org B · Conta");
    const admin = await createUser("org-admin");
    await addOrganizationAdmin(admin.id, organizationId);
    const manager = await createUser("org-manager");
    // A manager of two practices of the organization is still not its admin.
    await addMember(manager.id, practiceId, "PRACTICE_MANAGER");
    await addMember(manager.id, secondId, "PRACTICE_MANAGER");

    const asAdmin = practiceContext(admin, (await getPracticeAccess(admin.id, practiceId))!);
    const result = await loadOrganizationIndicators(asAdmin, WEEK, NOW);
    expect(result.practices.map((row) => row.practiceId).sort()).toEqual([practiceId, secondId].sort());
    expect(result.practices.map((row) => row.practiceId)).not.toContain(foreignId);

    const asManager = practiceContext(manager, (await getPracticeAccess(manager.id, practiceId))!);
    await expect(loadOrganizationIndicators(asManager, WEEK, NOW)).rejects.toMatchObject({ code: "not_allowed" });
  });
});

describe("recordConfirmationWorkMinute", () => {
  const minutesOf = async (practiceId: string) => (await forPractice(practiceId).confirmationWorkTime.findMany()).reduce((total, row) => total + row.minutes, 0);

  it("counts one minute a minute, however many tabs are open", async () => {
    const target = await createAgendaFixture("Consultório Minutos");
    const secretary = await contextAs(target, "SECRETARY");
    const start = new Date("2026-10-20T09:00:00-03:00");
    await recordConfirmationWorkMinute(secretary, start);
    await recordConfirmationWorkMinute(secretary, new Date(start.getTime() + 5_000)); // a second tab
    expect(await minutesOf(target.practiceId)).toBe(1);
    await recordConfirmationWorkMinute(secretary, new Date(start.getTime() + 60_000));
    expect(await minutesOf(target.practiceId)).toBe(2);
  });

  it("adds two people working at the same time", async () => {
    const target = await createAgendaFixture("Consultório Duas Secretárias");
    const start = new Date("2026-10-20T09:00:00-03:00");
    await recordConfirmationWorkMinute(await contextAs(target, "SECRETARY"), start);
    await recordConfirmationWorkMinute(await contextAs(target, "SECRETARY"), start);
    expect(await minutesOf(target.practiceId)).toBe(2);
  });

  it("starts a new day at midnight of the practice's time zone", async () => {
    const target = await createAgendaFixture("Consultório Meia-Noite");
    const secretary = await contextAs(target, "SECRETARY");
    await recordConfirmationWorkMinute(secretary, new Date("2026-10-20T23:59:30-03:00"));
    await recordConfirmationWorkMinute(secretary, new Date("2026-10-21T00:00:40-03:00"));
    const rows = await target.db.confirmationWorkTime.findMany({ orderBy: { date: "asc" } });
    expect(rows.map((row) => [row.date.toISOString().slice(0, 10), row.minutes])).toEqual([
      ["2026-10-20", 1],
      ["2026-10-21", 1],
    ]);
  });

  it("is not for the professional, who has no such list", async () => {
    const target = await createAgendaFixture("Consultório Profissional");
    await expect(recordConfirmationWorkMinute(await contextAs(target, "PROFESSIONAL"))).rejects.toMatchObject({ code: "not_allowed" });
  });

  it("feeds the indicator, which reads the practice's total only", async () => {
    const target = await createAgendaFixture("Consultório Tempo");
    const secretary = await contextAs(target, "SECRETARY");
    await recordConfirmationWorkMinute(secretary, new Date("2026-10-20T09:00:00-03:00"));
    await recordConfirmationWorkMinute(secretary, new Date("2026-10-20T09:01:00-03:00"));
    await recordConfirmationWorkMinute(secretary, new Date("2026-10-21T09:00:00-03:00"));
    const { confirmationWork } = await loadIndicators(await contextAs(target, "PRACTICE_MANAGER"), WEEK, NOW);
    // 3 minutes in 2 days.
    expect(confirmationWork).toMatchObject({ minutesPerDay: 1.5, measuredDays: 2 });
  });
});
