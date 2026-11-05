import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db";
import { AgendaError } from "@/lib/agenda/errors";
import { changeAppointmentStatus, ownProfessionalIds, rescheduleAppointment } from "@/lib/appointments/appointments";
import { OCCUPYING_STATUSES } from "@/lib/appointments/status";
import { toZoned } from "@/lib/dates/zoned";
import { markForGoogleSync, requestGoogleSync } from "./queue";

/**
 * Changes made in Google to the system's events (PRD 5, rules 3 and 4; D-10,
 * D-63): the work list, the decision, and the conflicts between Google blocks and
 * appointments.
 *
 * - Accept a move: rescheduled to the time and duration set in Google (D-11), with
 *   the conflict check of any booking; only the manager overbooks.
 * - Accept a deletion: Cancelado pelo consultório.
 * - Revert: the appointment is exported again and Google gets the system's version.
 *
 * Both accepts go through the appointment services with GOOGLE as the source and
 * the person as the author. The office resolves any change; the professional only
 * those of their own agenda.
 */

export type GoogleChangeDecision = "accept" | "revert";

/** Whose agenda the person sees: everyone's, or only their own (the professional). */
async function agendaFilter(context: PracticeContext) {
  const { role } = context.access;
  if (can(role, "google-changes:resolve")) return {};
  if (can(role, "google-changes:resolve-own")) return { professionalId: { in: await ownProfessionalIds(context) } };
  throw new AgendaError("not_allowed", "Cannot see Google changes");
}

/** Open pending changes of appointments still waiting for the visit, the oldest first. */
export async function listGoogleChanges(context: PracticeContext, now = new Date()) {
  const visible = await agendaFilter(context);
  const rows = await context.db.pendingGoogleChange.findMany({
    where: { resolvedAt: null, appointment: { is: { ...visible, status: { in: ["SCHEDULED", "CONFIRMED"] }, endsAt: { gt: now } } } },
    orderBy: { detectedAt: "asc" },
    include: {
      appointment: {
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          status: true,
          patient: { select: { name: true } },
          professional: { select: { id: true, name: true } },
          location: { select: { timeZone: true } },
        },
      },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    detectedAt: row.detectedAt,
    appointmentId: row.appointment.id,
    status: row.appointment.status,
    patientName: row.appointment.patient.name,
    professionalId: row.appointment.professional.id,
    professionalName: row.appointment.professional.name,
    timeZone: row.appointment.location.timeZone,
    startsAt: row.appointment.startsAt,
    endsAt: row.appointment.endsAt,
    proposedStartsAt: row.proposedStartsAt,
    proposedEndsAt: row.proposedEndsAt,
  }));
}

export type GoogleChangeItem = Awaited<ReturnType<typeof listGoogleChanges>>[number];

/** The open pending change of one appointment, for its detail page. */
export async function googleChangeOf(context: PracticeContext, appointmentId: string, now = new Date()) {
  if (!isUuid(appointmentId)) return null;
  const visible = await agendaFilter(context).catch(() => null);
  if (!visible) return null;
  return (await listGoogleChanges(context, now)).find((item) => item.appointmentId === appointmentId) ?? null;
}

/**
 * Future Google blocks over appointments that hold the time (rule 4): an alert for
 * the secretary, never a cancellation.
 */
export async function listGoogleConflicts(context: PracticeContext, now = new Date()) {
  const visible = await agendaFilter(context);
  const blocks = await context.db.timeBlock.findMany({
    where: { ...visible, source: "GOOGLE", endsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    select: { id: true, professionalId: true, startsAt: true, endsAt: true, allDay: true },
  });
  if (blocks.length === 0) return [];
  const appointments = await context.db.appointment.findMany({
    where: {
      professionalId: { in: [...new Set(blocks.map((block) => block.professionalId))] },
      status: { in: [...OCCUPYING_STATUSES] },
      endsAt: { gt: now },
      startsAt: { lt: blocks.reduce((latest, block) => (block.endsAt > latest ? block.endsAt : latest), now) },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      professionalId: true,
      startsAt: true,
      endsAt: true,
      status: true,
      patient: { select: { name: true } },
      professional: { select: { name: true } },
      location: { select: { timeZone: true } },
    },
  });
  return appointments.flatMap((appointment) => {
    const over = blocks.filter((block) => block.professionalId === appointment.professionalId && block.startsAt < appointment.endsAt && block.endsAt > appointment.startsAt);
    if (over.length === 0) return [];
    return [
      {
        appointmentId: appointment.id,
        status: appointment.status,
        patientName: appointment.patient.name,
        professionalName: appointment.professional.name,
        timeZone: appointment.location.timeZone,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        blocks: over.map((block) => ({ startsAt: block.startsAt, endsAt: block.endsAt, allDay: block.allDay })),
      },
    ];
  });
}

export async function resolveGoogleChange(
  context: PracticeContext,
  input: { changeId: string; decision: GoogleChangeDecision; allowConflict?: boolean },
  now = new Date(),
): Promise<{ appointmentId?: string; overbooked?: boolean }> {
  const { user, db } = context;
  const visible = await agendaFilter(context);
  const change = isUuid(input.changeId)
    ? await db.pendingGoogleChange.findFirst({
        where: { id: input.changeId, appointment: { is: visible } },
        include: { appointment: { select: { id: true, status: true, startsAt: true, location: { select: { timeZone: true } } } } },
      })
    : null;
  if (!change) throw new AgendaError("not_found", "Pending change not found");
  if (change.resolvedAt) throw new AgendaError("already_resolved", "Already resolved");
  const { appointment } = change;

  if (input.decision === "revert") {
    const reverted = await db.$transaction(async (tx) => {
      const { count } = await tx.pendingGoogleChange.updateMany({
        where: { id: change.id, resolvedAt: null },
        data: { resolution: "REVERTED", resolvedAt: now, resolvedByUserId: user.id },
      });
      if (count === 0) return false;
      // Exported again: Google gets the system's version back (patch, or insert of a deleted event).
      await markForGoogleSync(tx, [appointment.id], now);
      await tx.auditEvent.create({
        data: { practiceId: context.access.practiceId, actorType: "USER", actorUserId: user.id, action: "google_change.reverted", entityType: "Appointment", entityId: appointment.id, changedFields: [] },
      });
      return true;
    });
    if (!reverted) throw new AgendaError("already_resolved", "Already resolved");
    await requestGoogleSync(context.access.practiceId, [appointment.id], db);
    return {};
  }

  if (change.kind === "DELETED") {
    await changeAppointmentStatus(context, { appointmentId: appointment.id, to: "CANCELED_BY_PRACTICE", from: appointment.status, source: "GOOGLE", googleChangeId: change.id });
    return { appointmentId: appointment.id };
  }

  if (!change.proposedStartsAt || !change.proposedEndsAt) throw new AgendaError("invalid_date", "The change has no time");
  const start = toZoned(change.proposedStartsAt, appointment.location.timeZone);
  const result = await rescheduleAppointment(context, {
    appointmentId: appointment.id,
    date: start.date,
    time: start.time,
    allowConflict: input.allowConflict,
    googleChangeId: change.id,
    durationMinutes: Math.round((change.proposedEndsAt.getTime() - change.proposedStartsAt.getTime()) / 60_000),
  });
  return { appointmentId: result.id, overbooked: result.overbooked };
}
