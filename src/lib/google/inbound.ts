import { forPractice, prisma } from "@/lib/db";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { forgetAccessToken, googleApiFor } from "./connection";
import type { GoogleSyncOptions } from "./index";
import { isGoogleError, type GoogleCalendarApi, type GoogleEvent } from "./provider";
import { blockFromEvent, busyCalendarIds, sameTimes, syncWindow, timesOf } from "./rules";

/**
 * Google → system (PRD 5; D-10, D-15, D-60, D-61, D-63). Each sync of a connection
 * reads, for every calendar some professional of the connection needs, the events
 * of the next 90 days (recurring ones expanded), and:
 *
 * - in each practice where the calendar counts as busy for the professional,
 *   makes the Google blocks match the busy events: created, moved, deleted. A
 *   calendar that stopped counting loses its blocks. Nothing of the events'
 *   content is kept;
 * - in the practice whose secondary calendar it is, compares each appointment's
 *   event with the appointment. An event moved or deleted in Google after the
 *   system's last write becomes a pending change (never a direct change, rule 3);
 *   an appointment still waiting for its export is skipped, since Google shows an
 *   older version of it.
 *
 * The window moves with every read, so an event that leaves it, to the past or
 * beyond 90 days, loses its block like a deleted one. Pushes and the 4-minute
 * polling (src/lib/inngest/functions.ts) both land here.
 *
 * Connections and calendars are read through the base client (they serve several
 * practices, D-04); blocks and pending changes are written through each practice's
 * scoped client.
 */

/** The polling skips calendars a push had read this recently. */
export const STALE_AFTER_MS = 3 * 60_000;

/** Statuses whose event a change in Google can still move or delete. */
const REVIEWABLE_STATUSES = ["SCHEDULED", "CONFIRMED"] as const;

type Plan = {
  id: string;
  practiceId: string;
  allDayEventsBlock: boolean;
  timeZone: string;
  busy: Set<string>;
  ownSecondaryId: string | null;
};

export type SyncSummary = { calendars: number; failed: number };

/**
 * The active connection and, for each active professional using it, the calendars
 * that count as busy and their own secondary calendar; null when the connection
 * is not active or nobody uses it.
 */
export async function loadPlans(connectionId: string) {
  // Base client: see the module comment.
  const connection = await prisma.googleConnection.findUnique({ where: { id: connectionId }, include: { calendars: true } });
  if (!connection || connection.status !== "ACTIVE") return null;
  const professionals = await prisma.professional.findMany({
    where: { googleConnectionId: connectionId, active: true },
    select: { id: true, practiceId: true, allDayEventsBlock: true, googleBusyCalendarIds: true, googleBusyCalendarsChosen: true, secondaryCalendar: { select: { googleCalendarId: true } } },
  });
  if (professionals.length === 0) return null;
  const zones = new Map<string, string>();
  const plans: Plan[] = [];
  for (const professional of professionals) {
    if (!zones.has(professional.practiceId)) zones.set(professional.practiceId, await agendaTimeZone(forPractice(professional.practiceId)));
    const ownSecondaryId = professional.secondaryCalendar?.googleCalendarId ?? null;
    const busy = new Set(
      busyCalendarIds({ calendars: connection.calendars, ownSecondaryId, chosen: professional.googleBusyCalendarsChosen, chosenIds: professional.googleBusyCalendarIds }),
    );
    plans.push({ id: professional.id, practiceId: professional.practiceId, allDayEventsBlock: professional.allDayEventsBlock, timeZone: zones.get(professional.practiceId)!, busy, ownSecondaryId });
  }
  return { connection, plans };
}

/** Every calendar some professional reads: the busy ones and the own secondary calendars. */
export function calendarsInUse(plans: readonly Plan[]) {
  return new Set(plans.flatMap((plan) => [...plan.busy, ...(plan.ownSecondaryId ? [plan.ownSecondaryId] : [])]));
}

async function reconcileBlocks(plan: Plan, calendarId: string, events: GoogleEvent[], now: Date) {
  const db = forPractice(plan.practiceId);
  const desired = new Map<string, { startsAt: Date; endsAt: Date; allDay: boolean }>();
  for (const event of events) {
    const block = blockFromEvent(event, { allDayEventsBlock: plan.allDayEventsBlock, timeZone: plan.timeZone });
    if (block) desired.set(event.id, block);
  }
  // Blocks that already ended stay as history, unless their event is back in the window.
  const existing = await db.timeBlock.findMany({
    where: { professionalId: plan.id, source: "GOOGLE", googleCalendarId: calendarId, OR: [{ endsAt: { gt: now } }, { googleEventId: { in: [...desired.keys()] } }] },
    select: { id: true, googleEventId: true, startsAt: true, endsAt: true, allDay: true },
  });
  const byEvent = new Map(existing.map((block) => [block.googleEventId, block]));
  const gone = existing.filter((block) => !block.googleEventId || !desired.has(block.googleEventId));
  if (gone.length > 0) await db.timeBlock.deleteMany({ where: { id: { in: gone.map((block) => block.id) } } });

  const created = [];
  for (const [eventId, block] of desired) {
    const current = byEvent.get(eventId);
    if (!current) {
      created.push({ practiceId: plan.practiceId, professionalId: plan.id, source: "GOOGLE" as const, googleCalendarId: calendarId, googleEventId: eventId, ...block });
    } else if (current.startsAt.getTime() !== block.startsAt.getTime() || current.endsAt.getTime() !== block.endsAt.getTime() || current.allDay !== block.allDay) {
      await db.timeBlock.update({ where: { id: current.id }, data: block });
    }
  }
  if (created.length > 0) await db.timeBlock.createMany({ data: created, skipDuplicates: true });
}

async function reconcileSecondary(api: GoogleCalendarApi, plan: Plan, calendarId: string, events: GoogleEvent[], now: Date, timeMax: Date) {
  const db = forPractice(plan.practiceId);
  const listed = new Map(events.map((event) => [event.id, event]));
  const appointments = await db.appointment.findMany({
    where: {
      professionalId: plan.id,
      googleEventId: { not: null },
      googleSyncRequestedAt: null,
      status: { in: [...REVIEWABLE_STATUSES] },
      endsAt: { gt: now },
      OR: [{ startsAt: { lt: timeMax } }, { googleEventId: { in: [...listed.keys()] } }],
    },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      googleEventId: true,
      googleEventUpdatedAt: true,
      pendingGoogleChanges: { where: { resolvedAt: null }, select: { id: true, kind: true, proposedStartsAt: true, proposedEndsAt: true } },
    },
  });

  for (const appointment of appointments) {
    const eventId = appointment.googleEventId!;
    // Not in the window: moved away or deleted. Google tells which.
    const event = listed.get(eventId) ?? (await api.getEvent(calendarId, eventId));
    const open = appointment.pendingGoogleChanges[0] ?? null;
    const changedInGoogle = !event || event.updated.getTime() > (appointment.googleEventUpdatedAt?.getTime() ?? 0);

    let proposal: { kind: "MOVED" | "DELETED"; startsAt: Date | null; endsAt: Date | null } | null = null;
    if (!event || event.status === "cancelled") {
      if (changedInGoogle) proposal = { kind: "DELETED", startsAt: null, endsAt: null };
    } else if (sameTimes(event, appointment.startsAt, appointment.endsAt)) {
      // Back at the system's time: nothing left to review.
      if (open) await db.pendingGoogleChange.update({ where: { id: open.id }, data: { resolution: "SUPERSEDED", resolvedAt: now } });
      continue;
    } else if (changedInGoogle) {
      const times = timesOf(event);
      if (times) proposal = { kind: "MOVED", ...times };
    }
    if (!proposal) continue;
    const change = proposal;

    if (open) {
      const same =
        open.kind === proposal.kind &&
        open.proposedStartsAt?.getTime() === proposal.startsAt?.getTime() &&
        open.proposedEndsAt?.getTime() === proposal.endsAt?.getTime();
      if (!same) {
        await db.pendingGoogleChange.update({
          where: { id: open.id },
          data: { kind: proposal.kind, proposedStartsAt: proposal.startsAt, proposedEndsAt: proposal.endsAt, detectedAt: now },
        });
      }
      continue;
    }
    await db.$transaction(async (tx) => {
      await tx.pendingGoogleChange.create({
        data: { practiceId: plan.practiceId, appointmentId: appointment.id, kind: change.kind, proposedStartsAt: change.startsAt, proposedEndsAt: change.endsAt, detectedAt: now },
      });
      await tx.auditEvent.create({
        data: { practiceId: plan.practiceId, actorType: "GOOGLE", action: "google_change.detected", entityType: "Appointment", entityId: appointment.id, changedFields: [] },
      });
    });
  }
}

/**
 * Reads the connection's calendars and applies them to every professional of the
 * connection (see the module comment). `calendarIds` limits the read to some
 * calendars (a push); `onlyStale` skips the ones read in the last minutes (the
 * polling after a push).
 */
export async function syncConnectionCalendars(
  connectionId: string,
  options: GoogleSyncOptions & { calendarIds?: readonly string[]; onlyStale?: boolean } = {},
): Promise<SyncSummary> {
  const now = options.now ?? new Date();
  const summary: SyncSummary = { calendars: 0, failed: 0 };
  const loaded = await loadPlans(connectionId);
  if (!loaded) return summary;
  const { connection, plans } = loaded;

  // A calendar that stopped counting takes its blocks along.
  for (const plan of plans) {
    await forPractice(plan.practiceId).timeBlock.deleteMany({ where: { professionalId: plan.id, source: "GOOGLE", googleCalendarId: { notIn: [...plan.busy] } } });
  }

  const lastRead = new Map(connection.calendars.map((calendar) => [calendar.googleCalendarId, calendar.lastSyncedAt]));
  const needed = [...calendarsInUse(plans)]
    .filter((calendarId) => !options.calendarIds || options.calendarIds.includes(calendarId))
    .filter((calendarId) => {
      const read = lastRead.get(calendarId);
      return !options.onlyStale || !read || now.getTime() - read.getTime() >= STALE_AFTER_MS;
    });
  if (needed.length === 0) return summary;

  let api: GoogleCalendarApi;
  try {
    api = await googleApiFor(connectionId, { ...options, now });
  } catch (error) {
    if (isGoogleError(error)) return summary;
    throw error;
  }
  const window = syncWindow(now);
  for (const calendarId of needed) {
    try {
      const events = await api.listEvents(calendarId, window);
      for (const plan of plans) {
        if (plan.busy.has(calendarId)) await reconcileBlocks(plan, calendarId, events, now);
        if (plan.ownSecondaryId === calendarId) await reconcileSecondary(api, plan, calendarId, events, now, window.timeMax);
      }
      await prisma.googleCalendar.updateMany({ where: { googleConnectionId: connectionId, googleCalendarId: calendarId }, data: { lastSyncedAt: now } });
      summary.calendars += 1;
    } catch (error) {
      if (!isGoogleError(error)) throw error;
      summary.failed += 1;
      if (error.kind === "auth") {
        await forgetAccessToken(connectionId);
        break;
      }
      console.warn(`Could not read Google calendar ${calendarId} of connection ${connectionId} (${error.kind}): ${error.message}`);
    }
  }
  await prisma.googleConnection.update({ where: { id: connectionId }, data: { lastSyncAt: now } });
  return summary;
}

/** A push for one calendar (D-61): reads it for every professional of its connection. */
export async function syncGoogleCalendar(calendarRowId: string, options: GoogleSyncOptions = {}) {
  // Base client: the calendar belongs to a connection, not to a practice.
  const calendar = await prisma.googleCalendar.findUnique({ where: { id: calendarRowId }, select: { googleConnectionId: true, googleCalendarId: true } });
  if (!calendar) return { calendars: 0, failed: 0 };
  return syncConnectionCalendars(calendar.googleConnectionId, { ...options, calendarIds: [calendar.googleCalendarId] });
}
