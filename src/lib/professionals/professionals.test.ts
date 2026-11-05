import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AgendaError } from "@/lib/agenda/errors";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { createProfessional, getProfessionalSetup, listTeam, renameProfessional, setProfessionalActive, setProfessionalLocation } from "./professionals";

// The practice's professionals (PRD 11, D-91): who attends and where. Only the manager and
// the admin change them.

const NOW = new Date("2026-11-10T12:00:00Z");

let fixture: AgendaFixture;
let manager: PracticeContext;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Profissionais");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function code(promise: Promise<unknown>) {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof AgendaError) return error.code;
    throw error;
  }
}

function appointmentAt(data: AgendaFixture, professionalId: string, locationId: string, startsAt: string, status: "SCHEDULED" | "CANCELED_BY_PATIENT" = "SCHEDULED") {
  const start = new Date(startsAt);
  return data.db.appointment.create({
    data: {
      practiceId: data.practiceId,
      patientId: data.patient.id,
      professionalId,
      locationId,
      appointmentTypeId: data.types.consultation.id,
      startsAt: start,
      endsAt: new Date(start.getTime() + 30 * 60_000),
      durationMinutes: 30,
      priceCents: 45000,
      status,
    },
  });
}

describe("createProfessional", () => {
  it("creates the professional in the chosen locations, and audits without the name", async () => {
    const { id } = await createProfessional(manager, { name: "  Dra. Clara Nova  ", locationIds: [fixture.locations.aldeota.id, fixture.locations.manaus.id] });
    const professional = await fixture.db.professional.findUniqueOrThrow({ where: { id }, include: { locations: true } });
    expect(professional.name).toBe("Dra. Clara Nova");
    expect(professional.active).toBe(true);
    expect(professional.userId).toBeNull();
    expect(professional.locations.map((row) => row.locationId).sort()).toEqual([fixture.locations.aldeota.id, fixture.locations.manaus.id].sort());
    const audit = await fixture.db.auditEvent.findFirstOrThrow({ where: { action: "professional.created", entityId: id } });
    expect(JSON.stringify(audit)).not.toContain("Clara");
  });

  it("asks for a name and at least one active location", async () => {
    const locationIds = [fixture.locations.aldeota.id];
    expect(await code(createProfessional(manager, { name: " ", locationIds }))).toBe("professional_name_required");
    expect(await code(createProfessional(manager, { name: "Dr. Sem Unidade", locationIds: [] }))).toBe("professional_location_required");
    const inactive = await fixture.db.location.create({ data: { practiceId: fixture.practiceId, name: "Fechada", address: "Rua", active: false } });
    expect(await code(createProfessional(manager, { name: "Dr. Fechada", locationIds: [inactive.id] }))).toBe("location_unavailable");
  });

  it("refuses a name already in the practice, ignoring case", async () => {
    expect(await code(createProfessional(manager, { name: "dra. ana teste", locationIds: [fixture.locations.aldeota.id] }))).toBe("professional_name_taken");
  });

  it("does not take a location of another practice", async () => {
    const other = await createAgendaFixture("Outro consultório de profissionais");
    expect(await code(createProfessional(manager, { name: "Dr. Invasor", locationIds: [other.locations.aldeota.id] }))).toBe("location_unavailable");
  });

  it("is only for the manager and the admin", async () => {
    const input = { name: "Dr. Sem Permissão", locationIds: [fixture.locations.aldeota.id] };
    expect(await code(createProfessional(await contextAs(fixture, "SECRETARY"), input))).toBe("not_allowed");
    expect(await code(createProfessional(await contextAs(fixture, "PROFESSIONAL"), input))).toBe("not_allowed");
    expect(await code(listTeam(await contextAs(fixture, "SECRETARY")))).toBe("not_allowed");
    expect(await code(createProfessional(await contextAs(fixture, "ORG_ADMIN"), { ...input, name: "Dr. Do Admin" }))).toBe("ok");
  });
});

describe("renameProfessional", () => {
  it("renames and audits the field", async () => {
    const { id } = await createProfessional(manager, { name: "Dr. Nome Antigo", locationIds: [fixture.locations.aldeota.id] });
    await renameProfessional(manager, id, "Dr. Nome Novo");
    expect((await fixture.db.professional.findUniqueOrThrow({ where: { id } })).name).toBe("Dr. Nome Novo");
    expect((await fixture.db.auditEvent.findFirstOrThrow({ where: { action: "professional.updated", entityId: id } })).changedFields).toEqual(["name"]);
  });

  it("refuses an empty name, another one's name and someone out of the practice", async () => {
    const { id } = await createProfessional(manager, { name: "Dr. Renomeado", locationIds: [fixture.locations.aldeota.id] });
    expect(await code(renameProfessional(manager, id, " "))).toBe("professional_name_required");
    expect(await code(renameProfessional(manager, id, "Dra. Ana Teste"))).toBe("professional_name_taken");
    expect(await code(renameProfessional(manager, id, "Dr. Renomeado"))).toBe("ok");
    const other = await createAgendaFixture("Outro consultório de nomes");
    expect(await code(renameProfessional(manager, other.professionals.ana.id, "Invasor"))).toBe("professional_unavailable");
  });
});

describe("setProfessionalLocation", () => {
  it("links to a location and unlinks, taking that location's hours and days off along", async () => {
    const { id } = await createProfessional(manager, { name: "Dr. Duas Unidades", locationIds: [fixture.locations.aldeota.id] });
    const { practiceId, db } = fixture;
    const manaus = fixture.locations.manaus.id;
    await setProfessionalLocation(manager, { professionalId: id, locationId: manaus, linked: true }, NOW);
    await db.workingHours.create({ data: { practiceId, professionalId: id, locationId: manaus, weekday: 1, startTime: "08:00", endTime: "12:00" } });
    await db.workingHours.create({ data: { practiceId, professionalId: id, locationId: fixture.locations.aldeota.id, weekday: 2, startTime: "08:00", endTime: "12:00" } });
    await db.scheduleException.create({ data: { practiceId, professionalId: id, locationId: manaus, startsOn: new Date("2030-01-01"), endsOn: new Date("2030-01-02"), reason: "Reforma" } });
    await db.scheduleException.create({ data: { practiceId, professionalId: id, startsOn: new Date("2030-02-01"), endsOn: new Date("2030-02-02"), reason: "Férias" } });

    await setProfessionalLocation(manager, { professionalId: id, locationId: manaus, linked: false }, NOW);
    expect(await db.professionalLocation.count({ where: { professionalId: id, locationId: manaus } })).toBe(0);
    expect((await db.workingHours.findMany({ where: { professionalId: id } })).map((row) => row.weekday)).toEqual([2]);
    expect((await db.scheduleException.findMany({ where: { professionalId: id } })).map((row) => row.reason)).toEqual(["Férias"]);
    expect(await db.auditEvent.count({ where: { action: "professional.location_unlinked", entityId: id } })).toBe(1);
  });

  it("does not unlink while there are appointments ahead at that location, and says how many", async () => {
    const { id } = await createProfessional(manager, { name: "Dr. Com Agenda", locationIds: [fixture.locations.aldeota.id, fixture.locations.manaus.id] });
    const manaus = fixture.locations.manaus.id;
    const ahead = await appointmentAt(fixture, id, manaus, "2026-11-11T12:00:00Z");
    await appointmentAt(fixture, id, manaus, "2026-11-12T12:00:00Z", "CANCELED_BY_PATIENT");
    await appointmentAt(fixture, id, manaus, "2026-11-09T12:00:00Z");

    const failure = await setProfessionalLocation(manager, { professionalId: id, locationId: manaus, linked: false }, NOW).catch((error: AgendaError) => error);
    expect(failure).toMatchObject({ code: "professional_has_appointments", details: ["1 agendamento pela frente"] });

    await fixture.db.appointment.update({ where: { id: ahead.id }, data: { status: "CANCELED_BY_PATIENT" } });
    expect(await code(setProfessionalLocation(manager, { professionalId: id, locationId: manaus, linked: false }, NOW))).toBe("ok");
  });

  it("keeps at least one location: to leave the agenda, deactivate", async () => {
    const { id } = await createProfessional(manager, { name: "Dr. Uma Unidade", locationIds: [fixture.locations.aldeota.id] });
    expect(await code(setProfessionalLocation(manager, { professionalId: id, locationId: fixture.locations.aldeota.id, linked: false }, NOW))).toBe("professional_last_location");
  });

  it("does nothing when it is already so, and refuses an inactive location", async () => {
    const { id } = await createProfessional(manager, { name: "Dr. Sem Mudança", locationIds: [fixture.locations.aldeota.id] });
    await setProfessionalLocation(manager, { professionalId: id, locationId: fixture.locations.aldeota.id, linked: true }, NOW);
    expect(await fixture.db.auditEvent.count({ where: { action: "professional.location_linked", entityId: id } })).toBe(0);
    const inactive = await fixture.db.location.create({ data: { practiceId: fixture.practiceId, name: "Fechada 2", address: "Rua", active: false } });
    expect(await code(setProfessionalLocation(manager, { professionalId: id, locationId: inactive.id, linked: true }, NOW))).toBe("location_unavailable");
  });
});

describe("setProfessionalActive", () => {
  it("takes a professional off and back, keeping the history", async () => {
    const { id } = await createProfessional(manager, { name: "Dr. De Saída", locationIds: [fixture.locations.aldeota.id] });
    const past = await appointmentAt(fixture, id, fixture.locations.aldeota.id, "2026-11-09T12:00:00Z");
    await setProfessionalActive(manager, id, false, NOW);
    expect((await fixture.db.professional.findUniqueOrThrow({ where: { id } })).active).toBe(false);
    expect(await fixture.db.appointment.findUnique({ where: { id: past.id } })).not.toBeNull();
    await setProfessionalActive(manager, id, true, NOW);
    expect((await fixture.db.professional.findUniqueOrThrow({ where: { id } })).active).toBe(true);
    expect(await fixture.db.auditEvent.count({ where: { action: { in: ["professional.deactivated", "professional.reactivated"] }, entityId: id } })).toBe(2);
  });

  it("does not deactivate while there are appointments ahead", async () => {
    const { id } = await createProfessional(manager, { name: "Dr. Ainda Atende", locationIds: [fixture.locations.aldeota.id] });
    await appointmentAt(fixture, id, fixture.locations.aldeota.id, "2026-11-11T14:00:00Z");
    expect(await code(setProfessionalActive(manager, id, false, NOW))).toBe("professional_has_appointments");
  });
});

describe("reading", () => {
  it("lists everyone with their locations, the inactive too", async () => {
    const data = await createAgendaFixture("Consultório Lista de Profissionais");
    const context = await contextAs(data, "PRACTICE_MANAGER");
    await setProfessionalActive(context, data.professionals.bruno.id, false, NOW);
    const team = await listTeam(context);
    expect(team.find((row) => row.id === data.professionals.ana.id)).toMatchObject({ name: "Dra. Ana Teste", active: true, locations: ["Unidade Aldeota", "Unidade Manaus"] });
    expect(team.find((row) => row.id === data.professionals.bruno.id)).toMatchObject({ active: false, locations: ["Unidade Aldeota"] });
  });

  it("shows each active location as linked or not, and answers null out of the practice", async () => {
    const setup = await getProfessionalSetup(manager, fixture.professionals.bruno.id);
    expect(setup?.locations.find((row) => row.id === fixture.locations.aldeota.id)).toMatchObject({ linked: true });
    expect(setup?.locations.find((row) => row.id === fixture.locations.manaus.id)).toMatchObject({ linked: false });
    const other = await createAgendaFixture("Outro consultório de leitura");
    expect(await getProfessionalSetup(manager, other.professionals.ana.id)).toBeNull();
    expect(await getProfessionalSetup(manager, "nao-e-id")).toBeNull();
  });
});
