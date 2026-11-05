import { AgendaError } from "@/lib/agenda/errors";
import { OPEN_STATUSES } from "@/lib/appointments/status";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db";

/**
 * The practice's professionals (PRD 11, D-91), for the manager and the admin: who attends
 * and at which locations. The login comes from an invitation that points at this record
 * (D-38), the Google link and the WhatsApp channel from their own screens. A professional
 * is never deleted: past appointments keep pointing at them, so leaving is deactivating.
 */

const MAX_NAME = 120;

function assertManage(context: PracticeContext) {
  if (!can(context.access.role, "practice-settings:edit")) throw new AgendaError("not_allowed", "Cannot manage the practice's professionals");
}

function auditData(context: PracticeContext, action: string, entityId: string, changedFields: string[]) {
  return { practiceId: context.access.practiceId, actorType: "USER" as const, actorUserId: context.user.id, action, entityType: "Professional", entityId, changedFields };
}

async function validName(context: PracticeContext, raw: string, ignoreId?: string) {
  const name = raw.trim();
  if (!name || name.length > MAX_NAME) throw new AgendaError("professional_name_required", "A professional needs a name");
  const same = await context.db.professional.count({ where: { name: { equals: name, mode: "insensitive" }, ...(ignoreId ? { id: { not: ignoreId } } : {}) } });
  if (same > 0) throw new AgendaError("professional_name_taken", "Name already in this practice");
  return name;
}

async function findProfessional(context: PracticeContext, professionalId: string) {
  const professional = isUuid(professionalId) ? await context.db.professional.findFirst({ where: { id: professionalId } }) : null;
  if (!professional) throw new AgendaError("professional_unavailable", "Professional not found in this practice");
  return professional;
}

function appointmentsAhead(context: PracticeContext, where: { professionalId: string; locationId?: string }, now: Date) {
  return context.db.appointment.count({ where: { ...where, status: { in: [...OPEN_STATUSES] }, startsAt: { gt: now } } });
}

function refuseAhead(count: number) {
  if (count > 0) {
    throw new AgendaError("professional_has_appointments", "Appointments ahead", { details: [count === 1 ? "1 agendamento pela frente" : `${count} agendamentos pela frente`] });
  }
}

export async function listTeam(context: PracticeContext) {
  assertManage(context);
  const rows = await context.db.professional.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, active: true, userId: true, locations: { select: { location: { select: { name: true } } }, orderBy: { location: { name: "asc" } } } },
  });
  return rows.map(({ userId, locations, ...row }) => ({ ...row, hasLogin: Boolean(userId), locations: locations.map((link) => link.location.name) }));
}

/** One professional and the practice's active locations, each said to be linked or not. */
export async function getProfessionalSetup(context: PracticeContext, professionalId: string) {
  assertManage(context);
  if (!isUuid(professionalId)) return null;
  const { db } = context;
  const professional = await db.professional.findFirst({
    where: { id: professionalId },
    select: { id: true, name: true, active: true, userId: true, locations: { select: { locationId: true } } },
  });
  if (!professional) return null;
  const linked = new Set(professional.locations.map((row) => row.locationId));
  const locations = await db.location.findMany({
    where: { OR: [{ active: true }, { id: { in: [...linked] } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, active: true },
  });
  return {
    id: professional.id,
    name: professional.name,
    active: professional.active,
    hasLogin: Boolean(professional.userId),
    locations: locations.map((location) => ({ ...location, linked: linked.has(location.id) })),
  };
}

export async function createProfessional(context: PracticeContext, input: { name: string; locationIds: readonly string[] }) {
  assertManage(context);
  const { db, access } = context;
  const name = await validName(context, input.name);
  const locationIds = [...new Set(input.locationIds)];
  if (locationIds.length === 0) throw new AgendaError("professional_location_required", "A professional needs a location");
  const found = locationIds.every(isUuid) ? await db.location.count({ where: { id: { in: locationIds }, active: true } }) : 0;
  if (found !== locationIds.length) throw new AgendaError("location_unavailable", "Location not found or inactive");
  return db.$transaction(async (tx) => {
    const professional = await tx.professional.create({ data: { practiceId: access.practiceId, name } });
    await tx.professionalLocation.createMany({ data: locationIds.map((locationId) => ({ practiceId: access.practiceId, professionalId: professional.id, locationId })) });
    await tx.auditEvent.create({ data: auditData(context, "professional.created", professional.id, ["name", "locationId"]) });
    return { id: professional.id };
  });
}

export async function renameProfessional(context: PracticeContext, professionalId: string, rawName: string) {
  assertManage(context);
  const professional = await findProfessional(context, professionalId);
  const name = await validName(context, rawName, professional.id);
  if (name === professional.name) return;
  await context.db.$transaction(async (tx) => {
    await tx.professional.update({ where: { id: professional.id }, data: { name } });
    await tx.auditEvent.create({ data: auditData(context, "professional.updated", professional.id, ["name"]) });
  });
}

/**
 * Links or unlinks a location. Unlinking takes that location's working hours and days off
 * along, and waits for the appointments ahead to be moved: they would be left pointing at
 * a location the booking form no longer offers for this professional.
 */
export async function setProfessionalLocation(context: PracticeContext, input: { professionalId: string; locationId: string; linked: boolean }, now = new Date()) {
  assertManage(context);
  const { db, access } = context;
  const { locationId, linked } = input;
  const professional = await findProfessional(context, input.professionalId);
  const location = isUuid(locationId) ? await db.location.findFirst({ where: { id: locationId } }) : null;
  if (!location) throw new AgendaError("location_unavailable", "Location not found in this practice");
  const where = { professionalId: professional.id, locationId };
  const isLinked = (await db.professionalLocation.count({ where })) > 0;
  if (isLinked === linked) return;

  if (linked) {
    if (!location.active) throw new AgendaError("location_unavailable", "Location inactive");
    await db.$transaction(async (tx) => {
      await tx.professionalLocation.create({ data: { practiceId: access.practiceId, ...where } });
      await tx.auditEvent.create({ data: auditData(context, "professional.location_linked", professional.id, ["locationId"]) });
    });
    return;
  }

  refuseAhead(await appointmentsAhead(context, where, now));
  if ((await db.professionalLocation.count({ where: { professionalId: professional.id } })) <= 1) {
    throw new AgendaError("professional_last_location", "A professional keeps a location");
  }
  await db.$transaction(async (tx) => {
    await tx.workingHours.deleteMany({ where });
    await tx.scheduleException.deleteMany({ where });
    await tx.professionalLocation.deleteMany({ where });
    await tx.auditEvent.create({ data: auditData(context, "professional.location_unlinked", professional.id, ["locationId"]) });
  });
}

/** Deactivated, a professional leaves the agenda and the booking form; the history stays. */
export async function setProfessionalActive(context: PracticeContext, professionalId: string, active: boolean, now = new Date()) {
  assertManage(context);
  const professional = await findProfessional(context, professionalId);
  if (professional.active === active) return;
  if (!active) refuseAhead(await appointmentsAhead(context, { professionalId: professional.id }, now));
  await context.db.$transaction(async (tx) => {
    await tx.professional.update({ where: { id: professional.id }, data: { active } });
    await tx.auditEvent.create({ data: auditData(context, active ? "professional.reactivated" : "professional.deactivated", professional.id, ["active"]) });
  });
}
