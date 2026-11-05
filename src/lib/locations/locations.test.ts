import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AgendaError } from "@/lib/agenda/errors";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import {
  addScheduleException,
  addWorkingHours,
  listLocations,
  loadProfessionalHours,
  removeScheduleException,
  removeWorkingHours,
  saveLocation,
  setLocationActive,
  updateWorkingHours,
} from "./locations";

// Unidades e horários (PRD 11, D-86): only the manager and the admin change them.

vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);

let fixture: AgendaFixture;
let manager: PracticeContext;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Unidades");
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

describe("locations", () => {
  it("creates and edits a location, with the audit naming only the fields", async () => {
    const { id } = await saveLocation(manager, { name: "Unidade Nova", address: "Rua A, 1", timeZone: "America/Fortaleza" });
    await saveLocation(manager, { id, name: "Unidade Nova", address: "Rua B, 2", timeZone: "America/Fortaleza" });
    expect(await fixture.db.location.findUniqueOrThrow({ where: { id } })).toMatchObject({ address: "Rua B, 2", active: true });
    const audit = await fixture.db.auditEvent.findFirstOrThrow({ where: { action: "location.updated", entityId: id } });
    expect(audit.changedFields).toEqual(["address"]);
    expect(JSON.stringify(audit)).not.toContain("Rua B");
  });

  it("asks for the name, the address and a known time zone", async () => {
    expect(await code(saveLocation(manager, { name: " ", address: "Rua", timeZone: "America/Fortaleza" }))).toBe("location_name_required");
    expect(await code(saveLocation(manager, { name: "X", address: " ", timeZone: "America/Fortaleza" }))).toBe("location_address_required");
    expect(await code(saveLocation(manager, { name: "X", address: "Rua", timeZone: "Marte/Olympus" }))).toBe("invalid_time_zone");
  });

  it("keeps the secretary and the professional out", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    const professional = await contextAs(fixture, "PROFESSIONAL");
    expect(await code(saveLocation(secretary, { name: "X", address: "Rua", timeZone: "America/Fortaleza" }))).toBe("not_allowed");
    expect(await code(listLocations(professional))).toBe("not_allowed");
  });

  it("does not reach a location of another practice", async () => {
    const other = await createAgendaFixture("Outro consultório de unidades");
    expect(await code(saveLocation(manager, { id: other.locations.aldeota.id, name: "X", address: "Rua", timeZone: "America/Fortaleza" }))).toBe("location_unavailable");
  });

  it("lists who works at each location", async () => {
    const list = await listLocations(manager);
    expect(list.find((row) => row.id === fixture.locations.aldeota.id)?.professionals).toEqual(["Dr. Bruno Teste", "Dra. Ana Teste"]);
  });

  it("deactivates a location but never the last active one", async () => {
    const lonely = await createAgendaFixture("Consultório de uma unidade");
    const context = await contextAs(lonely, "PRACTICE_MANAGER");
    await setLocationActive(context, lonely.locations.manaus.id, false);
    expect((await lonely.db.location.findUniqueOrThrow({ where: { id: lonely.locations.manaus.id } })).active).toBe(false);
    expect(await code(setLocationActive(context, lonely.locations.aldeota.id, false))).toBe("last_location");
    await setLocationActive(context, lonely.locations.manaus.id, true);
    expect(await lonely.db.auditEvent.count({ where: { action: "location.reactivated" } })).toBe(1);
  });
});

describe("working hours", () => {
  const monday = (extra: Partial<Parameters<typeof addWorkingHours>[1]> = {}) => ({
    professionalId: fixture.professionals.bruno.id,
    locationId: fixture.locations.manaus.id,
    weekday: 1,
    startTime: "08:00",
    endTime: "12:00",
    ...extra,
  });

  it("adds intervals, links the professional to the location and reads them by weekday", async () => {
    await addWorkingHours(manager, monday());
    await addWorkingHours(manager, monday({ startTime: "14:00", endTime: "18:00" }));
    const link = await fixture.db.professionalLocation.findFirst({ where: { professionalId: fixture.professionals.bruno.id, locationId: fixture.locations.manaus.id } });
    expect(link).not.toBeNull();
    const { hours } = await loadProfessionalHours(manager, fixture.professionals.bruno.id);
    expect(hours.filter((row) => row.weekday === 1).map((row) => `${row.startTime}-${row.endTime}`)).toEqual(["08:00-12:00", "14:00-18:00"]);
  });

  it("refuses a period that makes no sense or overlaps another", async () => {
    expect(await code(addWorkingHours(manager, monday({ weekday: 2, startTime: "12:00", endTime: "08:00" })))).toBe("invalid_hours");
    expect(await code(addWorkingHours(manager, monday({ weekday: 9 })))).toBe("invalid_hours");
    expect(await code(addWorkingHours(manager, monday({ startTime: "11:00", endTime: "13:00" })))).toBe("overlapping_hours");
  });

  it("edits and removes an interval", async () => {
    const { id } = await addWorkingHours(manager, monday({ weekday: 3 }));
    await updateWorkingHours(manager, id, monday({ weekday: 3, startTime: "09:00", endTime: "11:00" }));
    expect(await fixture.db.workingHours.findUniqueOrThrow({ where: { id } })).toMatchObject({ startTime: "09:00", endTime: "11:00" });
    await removeWorkingHours(manager, id);
    expect(await fixture.db.workingHours.findUnique({ where: { id } })).toBeNull();
    expect(await fixture.db.auditEvent.count({ where: { action: "working_hours.removed", entityId: id } })).toBe(1);
  });
});

describe("schedule exceptions", () => {
  it("adds a whole-day exception for one professional and removes it", async () => {
    const [id] = await addScheduleException(manager, { professionalId: fixture.professionals.ana.id, allProfessionals: false, locationId: null, startsOn: "2030-01-04", endsOn: "2030-01-15", reason: "Férias" });
    const { exceptions } = await loadProfessionalHours(manager, fixture.professionals.ana.id);
    expect(exceptions.find((row) => row.id === id)).toMatchObject({ startsOn: "2030-01-04", endsOn: "2030-01-15", reason: "Férias", locationName: null });
    await removeScheduleException(manager, id);
    expect(await fixture.db.scheduleException.findUnique({ where: { id } })).toBeNull();
  });

  it("creates one per professional when it applies to all", async () => {
    const ids = await addScheduleException(manager, { professionalId: fixture.professionals.ana.id, allProfessionals: true, locationId: fixture.locations.aldeota.id, startsOn: "2030-11-20", endsOn: "2030-11-20", reason: "Feriado" });
    expect(ids).toHaveLength(2);
    expect(await fixture.db.scheduleException.count({ where: { id: { in: ids }, locationId: fixture.locations.aldeota.id } })).toBe(2);
  });

  it("asks for a reason and a period in order", async () => {
    const base = { professionalId: fixture.professionals.ana.id, allProfessionals: false, locationId: null };
    expect(await code(addScheduleException(manager, { ...base, startsOn: "2030-01-04", endsOn: "2030-01-05", reason: " " }))).toBe("exception_reason_required");
    expect(await code(addScheduleException(manager, { ...base, startsOn: "2030-01-05", endsOn: "2030-01-04", reason: "X" }))).toBe("invalid_exception");
    expect(await code(addScheduleException(manager, { ...base, startsOn: "amanhã", endsOn: "2030-01-04", reason: "X" }))).toBe("invalid_exception");
  });
});
