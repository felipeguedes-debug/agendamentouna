import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgendaError } from "@/lib/agenda/errors";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { auditPeople, listAuditEvents } from "./trail";

// The audit trail on the screen (PRD 3, req. 4; D-87).

const NOW = new Date("2026-11-10T15:00:00Z");

let fixture: AgendaFixture;
let manager: PracticeContext;

async function event(data: { action: string; entityType: string; entityId?: string; actorType?: "USER" | "PATIENT" | "GOOGLE"; actorUserId?: string; occurredAt?: Date; changedFields?: string[] }) {
  return fixture.db.auditEvent.create({
    data: { practiceId: fixture.practiceId, actorType: "USER", changedFields: [], occurredAt: new Date("2026-11-10T12:00:00Z"), ...data },
  });
}

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Auditoria");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
  const appointment = await fixture.db.appointment.create({
    data: {
      practiceId: fixture.practiceId,
      patientId: fixture.patient.id,
      professionalId: fixture.professionals.ana.id,
      locationId: fixture.locations.aldeota.id,
      appointmentTypeId: fixture.types.consultation.id,
      startsAt: new Date("2026-11-11T12:00:00Z"),
      endsAt: new Date("2026-11-11T12:30:00Z"),
      durationMinutes: 30,
      priceCents: 45000,
    },
  });
  await event({ action: "appointment.status_changed", entityType: "Appointment", entityId: appointment.id, actorUserId: manager.user.id, changedFields: ["status"] });
  await event({ action: "appointment.status_changed", entityType: "Appointment", entityId: appointment.id, actorType: "PATIENT", changedFields: ["status"], occurredAt: new Date("2026-11-09T12:00:00Z") });
  await event({ action: "appointment_type.updated", entityType: "AppointmentType", entityId: fixture.types.consultation.id, actorUserId: manager.user.id, changedFields: ["defaultPriceCents"], occurredAt: new Date("2026-10-20T12:00:00Z") });
  await event({ action: "patient.anonymized", entityType: "Patient", entityId: fixture.patient.id, actorUserId: manager.user.id, changedFields: ["name", "phone"], occurredAt: new Date("2026-11-08T12:00:00Z") });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const all = { period: "tudo" as const, who: null, area: null, page: 1 };

describe("listAuditEvents", () => {
  it("says who, when, what, where and which fields, newest first", async () => {
    const { items, total } = await listAuditEvents(manager, all, NOW);
    expect(total).toBe(4);
    expect(items[0]).toMatchObject({
      when: "Hoje, 09:00",
      who: manager.user.name,
      what: "Mudou o status do agendamento",
      where: "Maria Souza, 11/11 09:00",
      fields: "status",
    });
    expect(items[1]).toMatchObject({ when: "Ontem, 09:00", who: "Paciente", detail: "WhatsApp" });
    expect(items[0].href).toContain("/agendamentos/");
  });

  it("filters by period, person and area", async () => {
    expect((await listAuditEvents(manager, { ...all, period: "hoje" }, NOW)).total).toBe(1);
    expect((await listAuditEvents(manager, { ...all, period: "7d" }, NOW)).total).toBe(3);
    expect((await listAuditEvents(manager, { ...all, who: "paciente" }, NOW)).items.map((row) => row.who)).toEqual(["Paciente"]);
    expect((await listAuditEvents(manager, { ...all, who: manager.user.id }, NOW)).total).toBe(3);
    expect((await listAuditEvents(manager, { ...all, area: "tipos" }, NOW)).items.map((row) => row.what)).toEqual(["Alterou o tipo de atendimento"]);
    expect((await listAuditEvents(manager, { ...all, area: "pacientes" }, NOW)).total).toBe(1);
  });

  it("shows a patient who asked for erasure without the old name", async () => {
    await fixture.db.patient.update({ where: { id: fixture.patient.id }, data: { name: "Paciente excluído", phone: null, anonymizedAt: NOW } });
    const { items } = await listAuditEvents(manager, { ...all, area: "pacientes" }, NOW);
    expect(items[0]).toMatchObject({ where: "Paciente excluído", fields: "nome, celular" });
    expect(JSON.stringify(items)).not.toContain("Maria");
    await fixture.db.patient.update({ where: { id: fixture.patient.id }, data: { name: "Maria Souza", phone: "+5585998124455", anonymizedAt: null } });
  });

  it("never reads another practice's events", async () => {
    const other = await createAgendaFixture("Outra conta da auditoria");
    await other.db.auditEvent.create({ data: { practiceId: other.practiceId, actorType: "SYSTEM", action: "cadence.updated", entityType: "Cadence", changedFields: [] } });
    expect((await listAuditEvents(manager, { ...all, who: "sistema" }, NOW)).total).toBe(0);
  });

  it("is only for the manager and the admin", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    await expect(listAuditEvents(secretary, all, NOW)).rejects.toBeInstanceOf(AgendaError);
    await expect(auditPeople(secretary)).rejects.toBeInstanceOf(AgendaError);
    expect((await listAuditEvents(await contextAs(fixture, "ORG_ADMIN"), all, NOW)).total).toBe(4);
  });

  it("offers the people with events and the kinds that are not people", async () => {
    const people = await auditPeople(manager);
    expect(people.map((row) => row.label)).toEqual([manager.user.name, "Paciente", "Google Agenda", "SynkronosCRM", "Sistema"]);
  });
});
