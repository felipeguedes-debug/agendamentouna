import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { AgendaError } from "@/lib/agenda/errors";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import {
  createAppointmentType,
  listAppointmentTypes,
  setAppointmentTypeActive,
  updateAppointmentType,
  type AppointmentTypeInput,
} from "./appointment-types";

// "Tipos de atendimento" (PRD 4): the manager and the admin edit, the secretary
// views, the professional sees their own price. Types are never deleted (D-42).

let fixture: AgendaFixture;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Tipos");
});

afterAll(async () => {
  await prisma.$disconnect();
});

function input(overrides: Partial<AppointmentTypeInput> = {}): AppointmentTypeInput {
  return {
    name: "Laser transdérmico",
    displayName: null,
    category: "PROCEDURE",
    durationMinutes: 30,
    defaultPriceCents: 120000,
    color: "#D97706",
    preparation: "Não se expor ao sol",
    cadenceId: fixture.cadence.id,
    professionalPrices: [],
    ...overrides,
  };
}

describe("creating and editing types", () => {
  it("creates a type with a price per professional and an audit event without values", async () => {
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    const type = await createAppointmentType(
      manager,
      input({ professionalPrices: [{ professionalId: fixture.professionals.bruno.id, priceCents: 100000 }] }),
    );

    expect(type).toMatchObject({ name: "Laser transdérmico", category: "PROCEDURE", defaultPriceCents: 120000, active: true });
    const prices = await fixture.db.appointmentTypePrice.findMany({ where: { appointmentTypeId: type.id } });
    expect(prices).toEqual([expect.objectContaining({ professionalId: fixture.professionals.bruno.id, priceCents: 100000 })]);
    const audit = await fixture.db.auditEvent.findMany({ where: { entityId: type.id } });
    expect(audit).toEqual([
      expect.objectContaining({ action: "appointment_type.created", entityType: "AppointmentType", actorUserId: manager.user.id, changedFields: [] }),
    ]);
  });

  it("lets the organization admin edit too", async () => {
    const admin = await contextAs(fixture, "ORG_ADMIN");
    await expect(createAppointmentType(admin, input({ name: "Doppler venoso", category: "EXAM", color: "#7C3AED" }))).resolves.toBeDefined();
  });

  it("refuses the secretary and the professional", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const professional = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
    await expect(createAppointmentType(secretary, input())).rejects.toMatchObject({ code: "not_allowed" });
    await expect(createAppointmentType(professional, input())).rejects.toMatchObject({ code: "not_allowed" });
  });

  it("validates the fields", async () => {
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    const cases: [Partial<AppointmentTypeInput>, string][] = [
      [{ name: "  " }, "type_name_required"],
      [{ category: "BLOCK" }, "invalid_category"],
      [{ durationMinutes: 0 }, "invalid_duration"],
      [{ durationMinutes: 12.5 }, "invalid_duration"],
      [{ defaultPriceCents: -1 }, "invalid_price"],
      [{ color: "#123456" }, "invalid_color"],
      [{ cadenceId: "00000000-0000-0000-0000-000000000000" }, "cadence_unavailable"],
      [{ professionalPrices: [{ professionalId: "00000000-0000-0000-0000-000000000000", priceCents: 1 }] }, "professional_unavailable"],
    ];
    for (const [overrides, code] of cases) {
      const error = await createAppointmentType(manager, input(overrides)).catch((caught: unknown) => caught);
      expect(error, code).toBeInstanceOf(AgendaError);
      expect((error as AgendaError).code).toBe(code);
    }
  });

  it("does not accept a cadence or a professional of another practice", async () => {
    const other = await createAgendaFixture("Consultório Tipos Outro");
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    await expect(createAppointmentType(manager, input({ cadenceId: other.cadence.id }))).rejects.toMatchObject({ code: "cadence_unavailable" });
    await expect(
      createAppointmentType(manager, input({ professionalPrices: [{ professionalId: other.professionals.ana.id, priceCents: 1 }] })),
    ).rejects.toMatchObject({ code: "professional_unavailable" });
  });

  it("updates a type, replaces its prices and audits only the changed field names", async () => {
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    const type = await createAppointmentType(manager, input({ name: "Retorno", category: "FOLLOW_UP", color: "#3B5BDB" }));
    await updateAppointmentType(
      manager,
      type.id,
      input({
        name: "Retorno",
        category: "FOLLOW_UP",
        color: "#3B5BDB",
        defaultPriceCents: 0,
        professionalPrices: [{ professionalId: fixture.professionals.ana.id, priceCents: 5000 }],
      }),
    );

    const audit = await fixture.db.auditEvent.findFirst({ where: { entityId: type.id, action: "appointment_type.updated" } });
    expect(audit?.changedFields.sort()).toEqual(["defaultPriceCents", "prices"]);
    const prices = await fixture.db.appointmentTypePrice.findMany({ where: { appointmentTypeId: type.id } });
    expect(prices.map((price) => [price.professionalId, price.priceCents])).toEqual([[fixture.professionals.ana.id, 5000]]);
  });

  it("does not change appointments already booked when the price changes (D-12)", async () => {
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    const type = await createAppointmentType(manager, input({ name: "Botox", defaultPriceCents: 150000 }));
    const startsAt = new Date("2026-11-10T12:00:00Z");
    const appointment = await fixture.db.appointment.create({
      data: {
        practiceId: fixture.practiceId,
        locationId: fixture.locations.aldeota.id,
        professionalId: fixture.professionals.ana.id,
        patientId: fixture.patient.id,
        appointmentTypeId: type.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * 60_000),
        durationMinutes: 30,
        priceCents: 150000,
      },
    });
    await updateAppointmentType(manager, type.id, input({ name: "Botox", defaultPriceCents: 170000, durationMinutes: 45 }));

    expect(await fixture.db.appointment.findUnique({ where: { id: appointment.id } })).toMatchObject({ priceCents: 150000, durationMinutes: 30 });
  });

  it("deactivates and reactivates instead of deleting", async () => {
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    const type = await createAppointmentType(manager, input({ name: "Teleconsulta", category: "TELECONSULTATION", color: "#0F766E" }));
    await setAppointmentTypeActive(manager, type.id, false);
    expect((await listAppointmentTypes(manager)).find((row) => row.id === type.id)?.active).toBe(false);
    await setAppointmentTypeActive(manager, type.id, true);
    expect((await listAppointmentTypes(manager)).find((row) => row.id === type.id)?.active).toBe(true);
    const actions = (await fixture.db.auditEvent.findMany({ where: { entityId: type.id }, orderBy: { occurredAt: "asc" } })).map((event) => event.action);
    expect(actions).toEqual(["appointment_type.created", "appointment_type.deactivated", "appointment_type.reactivated"]);
  });

  it("does not find a type of another practice", async () => {
    const other = await createAgendaFixture("Consultório Tipos Isolado");
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    await expect(updateAppointmentType(manager, other.types.consultation.id, input())).rejects.toMatchObject({ code: "type_unavailable" });
    await expect(setAppointmentTypeActive(manager, other.types.consultation.id, false)).rejects.toMatchObject({ code: "type_unavailable" });
  });
});

describe("listing types", () => {
  it("shows the secretary every type with the cadence name and the prices", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const rows = await listAppointmentTypes(secretary);
    const consultation = rows.find((row) => row.id === fixture.types.consultation.id);
    expect(consultation).toMatchObject({ name: "Primeira consulta", cadenceName: "Consulta padrão", priceCents: 45000 });
  });

  it("shows the professional the active types at their own price", async () => {
    const local = await createAgendaFixture("Consultório Tipos Profissional");
    const manager = await contextAs(local, "PRACTICE_MANAGER");
    await updateAppointmentType(manager, local.types.consultation.id, {
      ...input({ cadenceId: local.cadence.id }),
      name: "Primeira consulta",
      category: "CONSULTATION",
      color: "#0F766E",
      defaultPriceCents: 45000,
      professionalPrices: [{ professionalId: local.professionals.ana.id, priceCents: 40000 }],
    });
    await setAppointmentTypeActive(manager, local.types.procedure.id, false);

    const ana = await contextAs(local, "PROFESSIONAL", { professionalId: local.professionals.ana.id });
    const rows = await listAppointmentTypes(ana);
    expect(rows.map((row) => [row.name, row.priceCents])).toEqual([["Primeira consulta", 40000]]);
    expect(rows[0].professionalPrices).toEqual([]);
  });
});
