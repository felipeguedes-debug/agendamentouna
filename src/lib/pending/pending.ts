import type { AppointmentStatus, PendingGoogleChangeKind } from "@/generated/prisma/enums";
import { agendaTimeZone, listWithoutClosing } from "@/lib/agenda/agenda";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { listFollowUps, type FollowUp } from "@/lib/cadence/worklist";
import { toZoned, todayIn, type IsoDate } from "@/lib/dates/zoned";
import { listGoogleChanges, listGoogleConflicts } from "@/lib/google/changes";
import type { PendingReason } from "./rules";

/**
 * What waits for someone in the practice (D-84): the cadence's work list, the changes
 * and conflicts from Google and the appointments without closing. The secretary, the
 * manager and the admin see all of it; the professional, the Google rows of their own
 * agenda, which is what `agenda:view` and `listGoogleChanges` already decide.
 */

export type PendingRow = {
  key: string;
  reason: PendingReason;
  appointmentId: string;
  status: AppointmentStatus;
  date: IsoDate;
  time: string;
  startsAt: Date;
  timeZone: string;
  patientName: string;
  patientPhone: string | null;
  typeName: string | null;
  professionalId: string | null;
  professionalName: string;
  lastSentAt: Date | null;
  lastReply: string | null;
  change: { id: string; kind: PendingGoogleChangeKind; proposedStartsAt: Date | null; proposedEndsAt: Date | null } | null;
  blocks: { startsAt: Date; endsAt: Date; allDay: boolean }[];
};

const EMPTY = { patientPhone: null, typeName: null, professionalId: null, lastSentAt: null, lastReply: null, change: null, blocks: [] };

function when(startsAt: Date, timeZone: string) {
  const { date, time } = toZoned(startsAt, timeZone);
  return { startsAt, timeZone, date, time };
}

function followUpRow(reason: PendingReason, row: FollowUp): PendingRow {
  return {
    ...EMPTY,
    ...when(row.startsAt, row.timeZone),
    key: `${reason}-${row.id}`,
    reason,
    appointmentId: row.id,
    status: row.status,
    patientName: row.patientName,
    patientPhone: row.patientPhone,
    typeName: row.typeName,
    professionalName: row.professionalName,
    lastSentAt: row.lastSentAt,
    lastReply: row.lastReply,
  };
}

export async function loadPending(context: PracticeContext, now = new Date()): Promise<PendingRow[]> {
  const { role } = context.access;
  const office = can(role, "agenda:view");
  const [agendaZone, followUps, withoutClosing, changes, conflicts] = await Promise.all([
    agendaTimeZone(context.db),
    office ? listFollowUps(context, now) : null,
    office ? listWithoutClosing(context, { professionalId: null, category: null, status: null }, now) : [],
    listGoogleChanges(context, now),
    listGoogleConflicts(context, now),
  ]);
  const rows: PendingRow[] = [];
  if (followUps) {
    rows.push(...followUps.unconfirmed.map((row) => followUpRow("unconfirmed", row)));
    rows.push(...followUps.rescheduleRequested.map((row) => followUpRow("reschedule_requested", row)));
    rows.push(...followUps.repliedWithoutConfirming.map((row) => followUpRow("replied", row)));
  }
  for (const change of changes) {
    rows.push({
      ...EMPTY,
      ...when(change.startsAt, change.timeZone),
      key: `google_change-${change.id}`,
      reason: "google_change",
      appointmentId: change.appointmentId,
      status: change.status,
      patientName: change.patientName,
      professionalId: change.professionalId,
      professionalName: change.professionalName,
      change: { id: change.id, kind: change.kind, proposedStartsAt: change.proposedStartsAt, proposedEndsAt: change.proposedEndsAt },
    });
  }
  for (const conflict of conflicts) {
    rows.push({
      ...EMPTY,
      ...when(conflict.startsAt, conflict.timeZone),
      key: `google_conflict-${conflict.appointmentId}`,
      reason: "google_conflict",
      appointmentId: conflict.appointmentId,
      status: conflict.status,
      patientName: conflict.patientName,
      professionalName: conflict.professionalName,
      blocks: conflict.blocks,
    });
  }
  for (const item of withoutClosing) {
    rows.push({
      ...EMPTY,
      key: `without_closing-${item.id}`,
      reason: "without_closing",
      appointmentId: item.id,
      status: item.status,
      date: item.date,
      time: item.time,
      startsAt: item.startsAt,
      timeZone: agendaZone,
      patientName: item.patientName,
      typeName: item.typeName,
      professionalId: item.professionalId,
      professionalName: item.professionalName,
    });
  }
  return rows;
}

/** The number on the menu. */
export async function countPending(context: PracticeContext, now = new Date()) {
  return (await loadPending(context, now)).length;
}

export async function pendingToday(context: PracticeContext, now = new Date()) {
  return todayIn(await agendaTimeZone(context.db), now);
}
