import { AgendaError } from "@/lib/agenda/errors";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { replanAppointments } from "@/lib/cadence/plan";
import { formatDateBr, isIsoDate, isTime } from "@/lib/dates/zoned";
import { isUuid, type PracticeTransaction } from "@/lib/db";

/**
 * Unidades e horários (PRD 11, D-86), for the manager and the admin: the practice's
 * locations, each professional's working hours and whole days off. The working hours
 * inform the agenda and do not stop a booking outside them (D-43).
 */

export const TIME_ZONES = [
  { value: "America/Fortaleza", label: "Fortaleza (America/Fortaleza)" },
  { value: "America/Sao_Paulo", label: "São Paulo (America/Sao_Paulo)" },
  { value: "America/Cuiaba", label: "Cuiabá (America/Cuiaba)" },
  { value: "America/Manaus", label: "Manaus (America/Manaus)" },
  { value: "America/Rio_Branco", label: "Rio Branco (America/Rio_Branco)" },
  { value: "America/Noronha", label: "Fernando de Noronha (America/Noronha)" },
] as const;

const MAX_NAME = 80;
const MAX_ADDRESS = 200;
const MAX_REASON = 120;

function assertSettings(context: PracticeContext) {
  if (!can(context.access.role, "practice-settings:edit")) throw new AgendaError("not_allowed", "Cannot change the practice's settings");
}

function auditData(context: PracticeContext, action: string, entityType: string, entityId: string, changedFields: string[]) {
  return { practiceId: context.access.practiceId, actorType: "USER" as const, actorUserId: context.user.id, action, entityType, entityId, changedFields };
}

export async function listLocations(context: PracticeContext) {
  assertSettings(context);
  const rows = await context.db.location.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, address: true, timeZone: true, active: true, professionals: { select: { professional: { select: { name: true } } }, orderBy: { professional: { name: "asc" } } } },
  });
  return rows.map(({ professionals, ...row }) => ({ ...row, professionals: professionals.map((link) => link.professional.name) }));
}

export type LocationInput = { id?: string; name: string; address: string; timeZone: string };

export async function saveLocation(context: PracticeContext, input: LocationInput, now = new Date()) {
  assertSettings(context);
  const { db, access } = context;
  const name = input.name.trim();
  const address = input.address.trim();
  if (!name || name.length > MAX_NAME) throw new AgendaError("location_name_required", "A location needs a name");
  if (!address || address.length > MAX_ADDRESS) throw new AgendaError("location_address_required", "A location needs an address");
  if (!TIME_ZONES.some((zone) => zone.value === input.timeZone)) throw new AgendaError("invalid_time_zone", "Unknown time zone");

  if (!input.id) {
    const created = await db.$transaction(async (tx) => {
      const row = await tx.location.create({ data: { practiceId: access.practiceId, name, address, timeZone: input.timeZone } });
      await tx.auditEvent.create({ data: auditData(context, "location.created", "Location", row.id, ["name", "address", "timeZone"]) });
      return row;
    });
    return { id: created.id };
  }

  const current = isUuid(input.id) ? await db.location.findFirst({ where: { id: input.id } }) : null;
  if (!current) throw new AgendaError("location_unavailable", "Location not found in this practice");
  const changedFields = [...(current.name !== name ? ["name"] : []), ...(current.address !== address ? ["address"] : []), ...(current.timeZone !== input.timeZone ? ["timeZone"] : [])];
  await db.$transaction(async (tx) => {
    await tx.location.update({ where: { id: current.id }, data: { name, address, timeZone: input.timeZone } });
    await tx.auditEvent.create({ data: auditData(context, "location.updated", "Location", current.id, changedFields) });
  });
  // The send window and the steps follow the location's clock (D-03): the cadence plans again.
  if (current.timeZone !== input.timeZone) await replanAppointments(db, { locationId: current.id }, now);
  return { id: current.id };
}

/** The agenda's time zone is the first active location's (D-41): one always stays. */
export async function setLocationActive(context: PracticeContext, locationId: string, active: boolean) {
  assertSettings(context);
  const { db } = context;
  const current = isUuid(locationId) ? await db.location.findFirst({ where: { id: locationId } }) : null;
  if (!current) throw new AgendaError("location_unavailable", "Location not found in this practice");
  if (current.active === active) return;
  if (!active && (await db.location.count({ where: { active: true } })) <= 1) throw new AgendaError("last_location", "The last active location stays");
  await db.$transaction(async (tx) => {
    await tx.location.update({ where: { id: locationId }, data: { active } });
    await tx.auditEvent.create({ data: auditData(context, active ? "location.reactivated" : "location.deactivated", "Location", locationId, ["active"]) });
  });
}

/** One professional's week and days off, for the screen. */
export async function loadProfessionalHours(context: PracticeContext, professionalId: string) {
  assertSettings(context);
  const { db } = context;
  if (!isUuid(professionalId)) return { hours: [], exceptions: [] };
  const [hours, exceptions] = await Promise.all([
    db.workingHours.findMany({
      where: { professionalId },
      orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      select: { id: true, weekday: true, startTime: true, endTime: true, locationId: true, location: { select: { name: true } } },
    }),
    db.scheduleException.findMany({
      where: { professionalId },
      orderBy: { startsOn: "asc" },
      select: { id: true, startsOn: true, endsOn: true, reason: true, location: { select: { name: true } } },
    }),
  ]);
  return {
    hours: hours.map(({ location, ...row }) => ({ ...row, locationName: location.name })),
    exceptions: exceptions.map((row) => ({
      id: row.id,
      startsOn: row.startsOn.toISOString().slice(0, 10),
      endsOn: row.endsOn.toISOString().slice(0, 10),
      reason: row.reason,
      locationName: row.location?.name ?? null,
    })),
  };
}

export type WorkingHoursInput = { professionalId: string; locationId: string; weekday: number; startTime: string; endTime: string };

async function checkedHours(context: PracticeContext, input: WorkingHoursInput, ignoreId?: string) {
  const { db } = context;
  if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) throw new AgendaError("invalid_hours", "Invalid weekday");
  if (!isTime(input.startTime) || !isTime(input.endTime) || input.startTime >= input.endTime) throw new AgendaError("invalid_hours", "Invalid working hours");
  const professional = isUuid(input.professionalId) ? await db.professional.findFirst({ where: { id: input.professionalId } }) : null;
  if (!professional) throw new AgendaError("professional_unavailable", "Professional not found");
  const location = isUuid(input.locationId) ? await db.location.findFirst({ where: { id: input.locationId, active: true } }) : null;
  if (!location) throw new AgendaError("location_unavailable", "Location not found or inactive");
  const overlapping = await db.workingHours.count({
    where: { professionalId: input.professionalId, weekday: input.weekday, startTime: { lt: input.endTime }, endTime: { gt: input.startTime }, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
  });
  if (overlapping > 0) throw new AgendaError("overlapping_hours", "Overlapping working hours");
}

/** An interval at a location also says the professional works there, which the booking form asks for. */
async function linkToLocation(tx: PracticeTransaction, practiceId: string, professionalId: string, locationId: string) {
  const linked = await tx.professionalLocation.count({ where: { professionalId, locationId } });
  if (linked === 0) await tx.professionalLocation.create({ data: { practiceId, professionalId, locationId } });
}

export async function addWorkingHours(context: PracticeContext, input: WorkingHoursInput) {
  assertSettings(context);
  await checkedHours(context, input);
  const { practiceId } = context.access;
  return context.db.$transaction(async (tx) => {
    const row = await tx.workingHours.create({ data: { practiceId, ...input } });
    await linkToLocation(tx, practiceId, input.professionalId, input.locationId);
    await tx.auditEvent.create({ data: auditData(context, "working_hours.created", "WorkingHours", row.id, ["weekday", "startTime", "endTime", "locationId"]) });
    return { id: row.id };
  });
}

export async function updateWorkingHours(context: PracticeContext, id: string, input: WorkingHoursInput) {
  assertSettings(context);
  const current = isUuid(id) ? await context.db.workingHours.findFirst({ where: { id } }) : null;
  if (!current) throw new AgendaError("hours_unavailable", "Working hours not found");
  await checkedHours(context, input, id);
  const { practiceId } = context.access;
  const changedFields = (["weekday", "startTime", "endTime", "locationId"] as const).filter((field) => current[field] !== input[field]);
  await context.db.$transaction(async (tx) => {
    await tx.workingHours.update({ where: { id }, data: { locationId: input.locationId, weekday: input.weekday, startTime: input.startTime, endTime: input.endTime } });
    await linkToLocation(tx, practiceId, current.professionalId, input.locationId);
    await tx.auditEvent.create({ data: auditData(context, "working_hours.updated", "WorkingHours", id, [...changedFields]) });
  });
}

export async function removeWorkingHours(context: PracticeContext, id: string) {
  assertSettings(context);
  const current = isUuid(id) ? await context.db.workingHours.findFirst({ where: { id } }) : null;
  if (!current) throw new AgendaError("hours_unavailable", "Working hours not found");
  await context.db.$transaction(async (tx) => {
    await tx.workingHours.delete({ where: { id } });
    await tx.auditEvent.create({ data: auditData(context, "working_hours.removed", "WorkingHours", id, []) });
  });
}

export type ExceptionInput = { professionalId: string; allProfessionals: boolean; locationId: string | null; startsOn: string; endsOn: string; reason: string };

/** Whole days off. "All the professionals" writes one row for each, because the model is per professional. */
export async function addScheduleException(context: PracticeContext, input: ExceptionInput) {
  assertSettings(context);
  const { db } = context;
  const { practiceId } = context.access;
  const reason = input.reason.trim();
  if (!reason || reason.length > MAX_REASON) throw new AgendaError("exception_reason_required", "An exception needs a reason");
  if (!isIsoDate(input.startsOn) || !isIsoDate(input.endsOn) || input.startsOn > input.endsOn) throw new AgendaError("invalid_exception", "Invalid exception period");
  if (input.locationId && !(isUuid(input.locationId) && (await db.location.count({ where: { id: input.locationId } })) > 0)) {
    throw new AgendaError("location_unavailable", "Location not found in this practice");
  }
  const professionals = input.allProfessionals
    ? await db.professional.findMany({ where: { active: true }, select: { id: true } })
    : isUuid(input.professionalId)
      ? await db.professional.findMany({ where: { id: input.professionalId }, select: { id: true } })
      : [];
  if (professionals.length === 0) throw new AgendaError("professional_unavailable", "Professional not found");
  return db.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const professional of professionals) {
      const row = await tx.scheduleException.create({
        data: { practiceId, professionalId: professional.id, locationId: input.locationId, startsOn: new Date(input.startsOn), endsOn: new Date(input.endsOn), reason },
      });
      await tx.auditEvent.create({ data: auditData(context, "schedule_exception.created", "ScheduleException", row.id, ["startsOn", "endsOn", "reason", "locationId"]) });
      ids.push(row.id);
    }
    return ids;
  });
}

export async function removeScheduleException(context: PracticeContext, id: string) {
  assertSettings(context);
  const current = isUuid(id) ? await context.db.scheduleException.findFirst({ where: { id } }) : null;
  if (!current) throw new AgendaError("exception_unavailable", "Exception not found");
  await context.db.$transaction(async (tx) => {
    await tx.scheduleException.delete({ where: { id } });
    await tx.auditEvent.create({ data: auditData(context, "schedule_exception.removed", "ScheduleException", id, []) });
  });
}

export function exceptionPeriodLabel(row: { startsOn: string; endsOn: string }) {
  return row.startsOn === row.endsOn ? formatDateBr(row.startsOn) : `${formatDateBr(row.startsOn).slice(0, 5)} a ${formatDateBr(row.endsOn)}`;
}
