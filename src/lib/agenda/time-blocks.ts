import { agendaTimeZone } from "@/lib/agenda/agenda";
import { OCCUPYING_STATUSES } from "@/lib/appointments/status";
import { ownProfessionalIds } from "@/lib/appointments/appointments";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { addDays, isIsoDate, isTime, startOfZonedDay, toZoned, zonedToUtc, type IsoDate } from "@/lib/dates/zoned";
import { isUuid } from "@/lib/db";
import { requestBlockGoogleSync } from "@/lib/google/queue";
import { AgendaError } from "./errors";

/**
 * Manual blocks (PRD 4, rule 2; D-85), in the agenda's time zone, as the agenda shows
 * them: with a reason, for the secretary and the manager in any agenda and for the
 * professional in their own. A block over an appointment warns and cancels nothing,
 * as a Google event does (D-64). The event in Google says only "Bloqueado". Blocks that
 * came from Google are not touched here: they change in Google.
 */

const MAX_REASON = 200;

export type TimeBlockInput = {
  professionalId: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  reason: string;
};

async function assertMayBlock(context: PracticeContext, professionalId: string) {
  const { role } = context.access;
  if (can(role, "time-blocks:manage")) return;
  if (can(role, "time-blocks:manage-own") && (await ownProfessionalIds(context)).includes(professionalId)) return;
  throw new AgendaError("not_allowed", "Cannot block this agenda");
}

async function periodOf(context: PracticeContext, input: Pick<TimeBlockInput, "date" | "startTime" | "endTime" | "allDay">) {
  if (!isIsoDate(input.date)) throw new AgendaError("invalid_date", "Invalid block date");
  const timeZone = await agendaTimeZone(context.db);
  if (input.allDay) return { startsAt: startOfZonedDay(input.date, timeZone), endsAt: startOfZonedDay(addDays(input.date, 1), timeZone) };
  if (!isTime(input.startTime) || !isTime(input.endTime) || input.startTime >= input.endTime) throw new AgendaError("invalid_block_time", "Invalid block period");
  return { startsAt: zonedToUtc(input.date, input.startTime, timeZone), endsAt: zonedToUtc(input.date, input.endTime, timeZone) };
}

async function validated(context: PracticeContext, input: TimeBlockInput) {
  const reason = input.reason.trim();
  if (!reason) throw new AgendaError("block_reason_required", "A block needs a reason");
  if (reason.length > MAX_REASON) throw new AgendaError("invalid_text", "Block reason too long");
  const professional = isUuid(input.professionalId)
    ? await context.db.professional.findFirst({ where: { id: input.professionalId, active: true }, select: { id: true, secondaryCalendar: { select: { id: true } } } })
    : null;
  if (!professional) throw new AgendaError("professional_unavailable", "Professional not found or inactive");
  await assertMayBlock(context, professional.id);
  return { reason, professional, ...(await periodOf(context, input)) };
}

/** The appointments in the period, for the warning on the form. Nothing happens to them. */
export async function blockConflicts(context: PracticeContext, input: Pick<TimeBlockInput, "professionalId" | "date" | "startTime" | "endTime" | "allDay">) {
  if (!isUuid(input.professionalId)) return [];
  await assertMayBlock(context, input.professionalId);
  const { startsAt, endsAt } = await periodOf(context, input);
  const rows = await context.db.appointment.findMany({
    where: { professionalId: input.professionalId, status: { in: [...OCCUPYING_STATUSES] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
    orderBy: { startsAt: "asc" },
    select: { id: true, startsAt: true, patient: { select: { name: true } }, location: { select: { timeZone: true } } },
  });
  return rows.map((row) => {
    const start = toZoned(row.startsAt, row.location.timeZone);
    return { id: row.id, patientName: row.patient.name, date: start.date, time: start.time };
  });
}

export async function createTimeBlock(context: PracticeContext, input: TimeBlockInput, now = new Date()) {
  const { reason, professional, startsAt, endsAt } = await validated(context, input);
  const { db, access, user } = context;
  const exported = Boolean(professional.secondaryCalendar);
  const block = await db.$transaction(async (tx) => {
    const created = await tx.timeBlock.create({
      data: {
        practiceId: access.practiceId,
        professionalId: professional.id,
        startsAt,
        endsAt,
        allDay: input.allDay,
        reason,
        source: "MANUAL",
        createdByUserId: user.id,
        googleSyncRequestedAt: exported ? now : null,
      },
    });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "time_block.created", entityType: "TimeBlock", entityId: created.id, changedFields: ["startsAt", "endsAt", "reason"] },
    });
    return created;
  });
  if (exported) await requestBlockGoogleSync(access.practiceId);
  return { id: block.id };
}

async function findManual(context: PracticeContext, blockId: string) {
  if (!isUuid(blockId)) return null;
  const block = await context.db.timeBlock.findFirst({ where: { id: blockId, source: "MANUAL", deletedAt: null } });
  if (!block) return null;
  const { role } = context.access;
  if (!can(role, "time-blocks:manage") && !(can(role, "time-blocks:manage-own") && (await ownProfessionalIds(context)).includes(block.professionalId))) return null;
  return block;
}

/** The manual block for the edit panel; null for a Google block or one out of reach. */
export async function getManualBlock(context: PracticeContext, blockId: string) {
  const block = await findManual(context, blockId);
  if (!block) return null;
  const timeZone = await agendaTimeZone(context.db);
  const start = toZoned(block.startsAt, timeZone);
  const author = block.createdByUserId ? await context.db.user.findFirst({ where: { id: block.createdByUserId }, select: { name: true } }) : null;
  return {
    id: block.id,
    professionalId: block.professionalId,
    date: start.date as IsoDate,
    startTime: block.allDay ? "" : start.time,
    endTime: block.allDay ? "" : toZoned(block.endsAt, timeZone).time,
    allDay: block.allDay,
    reason: block.reason ?? "",
    createdByName: author?.name ?? null,
    createdAt: toZoned(block.createdAt, timeZone),
  };
}

export async function updateTimeBlock(context: PracticeContext, blockId: string, input: TimeBlockInput, now = new Date()) {
  const current = await findManual(context, blockId);
  if (!current) throw new AgendaError("block_not_found", "Manual block not found");
  const { reason, professional, startsAt, endsAt } = await validated(context, input);
  const { db, access, user } = context;
  const changedFields = [
    ...(current.professionalId !== professional.id ? ["professionalId"] : []),
    ...(current.startsAt.getTime() !== startsAt.getTime() ? ["startsAt"] : []),
    ...(current.endsAt.getTime() !== endsAt.getTime() ? ["endsAt"] : []),
    ...(current.reason !== reason ? ["reason"] : []),
  ];
  const moved = changedFields.some((field) => field !== "reason");
  // Changing agendas leaves the event behind: the secondary calendar is per professional.
  const samePerson = current.professionalId === professional.id;
  const exported = Boolean(professional.secondaryCalendar) && (moved || Boolean(current.googleSyncRequestedAt));
  await db.$transaction(async (tx) => {
    await tx.timeBlock.update({
      where: { id: blockId },
      data: {
        professionalId: professional.id,
        startsAt,
        endsAt,
        allDay: input.allDay,
        reason,
        ...(samePerson ? {} : { googleCalendarId: null, googleEventId: null }),
        googleSyncRequestedAt: exported ? now : null,
        googleSyncAttempts: 0,
        googleSyncError: null,
      },
    });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "time_block.updated", entityType: "TimeBlock", entityId: blockId, changedFields },
    });
  });
  if (exported) await requestBlockGoogleSync(access.practiceId);
}

export async function removeTimeBlock(context: PracticeContext, blockId: string, now = new Date()) {
  const current = await findManual(context, blockId);
  if (!current) throw new AgendaError("block_not_found", "Manual block not found");
  const { db, access, user } = context;
  const hasEvent = Boolean(current.googleEventId);
  await db.$transaction(async (tx) => {
    if (hasEvent) await tx.timeBlock.update({ where: { id: blockId }, data: { deletedAt: now, googleSyncRequestedAt: now, googleSyncAttempts: 0, googleSyncError: null } });
    else await tx.timeBlock.delete({ where: { id: blockId } });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "time_block.removed", entityType: "TimeBlock", entityId: blockId, changedFields: [] },
    });
  });
  if (hasEvent) await requestBlockGoogleSync(access.practiceId);
}
