import { randomBytes } from "node:crypto";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { forPractice, prisma, type PracticeScopedClient } from "@/lib/db";
import { appointmentTypeDisplayName } from "@/lib/domain/labels";
import { forgetAccessToken, forgetManualBlockEvents, googleApiFor } from "./connection";
import { appointmentUrl, type GoogleSyncOptions } from "./index";
import { GoogleError, isGoogleError, type EventInput, type GoogleCalendarApi, type GoogleEvent } from "./provider";
import { blockEventTitle, eventDescription, eventIdFor, eventTitle, keepsEvent } from "./rules";

export { markForGoogleSync, requestGoogleSync } from "./queue";

/**
 * System → Google (PRD 5, Fluxo de dados; D-14, D-28, D-62): each marked
 * appointment gets its event in the professional's secondary calendar written,
 * retitled or deleted. Canceled and rescheduled appointments lose the event; past
 * appointments are not exported, only updated when they already have one.
 *
 * - The event id comes from the appointment id, so an insert that already happened
 *   (a crash before saving the id) turns into a patch, never a duplicate.
 * - The mark is cleared only if it is still the one read, so a change made during
 *   the export is exported next time.
 * - "auth" leaves the marks for when the professional links again (rule 6);
 *   "transient" is tried again on the next run, up to EXPORT_MAX_ATTEMPTS; anything
 *   else is recorded in googleSyncError and stops (PRD 8, sync failures).
 * - A secondary calendar the professional deleted in Google is forgotten; the
 *   connection's next sync creates it again and exports the future appointments.
 */

export const EXPORT_MAX_ATTEMPTS = 5;
const EXPORT_BATCH = 200;

export type ExportSummary = { exported: number; deleted: number; waiting: number; failed: number };

const EXPORT_SELECT = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  professionalId: true,
  googleEventId: true,
  googleSyncRequestedAt: true,
  googleSyncAttempts: true,
  patient: { select: { name: true, anonymizedAt: true } },
  appointmentType: { select: { displayName: true, category: true } },
  location: { select: { address: true, timeZone: true } },
  professional: { select: { secondaryCalendar: { select: { googleCalendarId: true, googleConnectionId: true } } } },
} as const;

function loadMarked(db: PracticeScopedClient, appointmentIds: readonly string[] | undefined) {
  return db.appointment.findMany({
    where: { googleSyncRequestedAt: { not: null }, ...(appointmentIds ? { id: { in: [...appointmentIds] } } : {}) },
    orderBy: { googleSyncRequestedAt: "asc" },
    take: EXPORT_BATCH,
    select: EXPORT_SELECT,
  });
}

type Row = Awaited<ReturnType<typeof loadMarked>>[number];

class CalendarGone extends Error {}

function eventInput(practiceId: string, row: Row): EventInput {
  return {
    summary: eventTitle({
      patientName: row.patient.name,
      anonymized: Boolean(row.patient.anonymizedAt),
      typeLabel: appointmentTypeDisplayName(row.appointmentType),
      status: row.status,
    }),
    description: eventDescription(appointmentUrl(practiceId, row.id)),
    location: row.location.address,
    start: row.startsAt,
    end: row.endsAt,
    timeZone: row.location.timeZone,
    appointmentId: row.id,
  };
}

/**
 * Inserts the event, or patches it when the id is taken (an insert that already
 * happened). Google keeps a deleted event's id: when it refuses to patch it back,
 * the event comes back under a new id.
 */
async function insertOrPatch(api: GoogleCalendarApi, calendarId: string, eventId: string, input: EventInput): Promise<{ eventId: string; event: GoogleEvent }> {
  try {
    return { eventId, event: await api.insertEvent(calendarId, eventId, input) };
  } catch (error) {
    // Inserting into a calendar that is not there.
    if (isGoogleError(error, "not_found")) throw new CalendarGone();
    if (!isGoogleError(error, "conflict")) throw error;
  }
  try {
    return { eventId, event: await api.patchEvent(calendarId, eventId, input) };
  } catch (error) {
    if (!isGoogleError(error, "not_found")) throw error;
  }
  // Hex digits stay inside Google's alphabet for ids (base32hex).
  const fresh = `${eventId}${randomBytes(4).toString("hex")}`;
  return { eventId: fresh, event: await api.insertEvent(calendarId, fresh, input) };
}

/** Writes what the appointment says; returns the event's id and "updated", or null when it has none. */
async function writeEvent(api: GoogleCalendarApi, practiceId: string, row: Row, calendarId: string, now: Date) {
  if (!keepsEvent(row.status) || (!row.googleEventId && row.endsAt <= now)) {
    if (row.googleEventId) {
      try {
        await api.deleteEvent(calendarId, row.googleEventId);
      } catch (error) {
        if (!isGoogleError(error, "not_found")) throw error;
      }
    }
    return null;
  }
  const input = eventInput(practiceId, row);
  if (row.googleEventId) {
    try {
      return { eventId: row.googleEventId, event: await api.patchEvent(calendarId, row.googleEventId, input) };
    } catch (error) {
      if (!isGoogleError(error, "not_found")) throw error;
    }
  }
  return insertOrPatch(api, calendarId, row.googleEventId ?? eventIdFor(row.id), input);
}

async function clearMark(db: PracticeScopedClient, row: Row) {
  await db.appointment.updateMany({ where: { id: row.id, googleSyncRequestedAt: row.googleSyncRequestedAt }, data: { googleSyncRequestedAt: null } });
}

async function forgetCalendar(db: PracticeScopedClient, row: { professionalId: string }, calendar: { googleCalendarId: string; googleConnectionId: string }) {
  await db.$transaction(async (tx) => {
    await tx.googleSecondaryCalendar.deleteMany({ where: { professionalId: row.professionalId, googleCalendarId: calendar.googleCalendarId } });
    await tx.appointment.updateMany({ where: { professionalId: row.professionalId, googleEventId: { not: null } }, data: { googleEventId: null, googleEventUpdatedAt: null } });
    await forgetManualBlockEvents(tx, row.professionalId);
  });
  // Base client: the calendar list belongs to the connection.
  await prisma.googleCalendar.deleteMany({ where: { googleConnectionId: calendar.googleConnectionId, googleCalendarId: calendar.googleCalendarId } });
}

/** Exports the practice's marked appointments (all of them, or those of `appointmentIds`). */
export async function exportAppointments(practiceId: string, options: GoogleSyncOptions & { appointmentIds?: readonly string[] } = {}): Promise<ExportSummary> {
  const now = options.now ?? new Date();
  const db = forPractice(practiceId);
  const summary: ExportSummary = { exported: 0, deleted: 0, waiting: 0, failed: 0 };
  const rows = await loadMarked(db, options.appointmentIds);
  await exportAppointmentRows(practiceId, db, rows, summary, options, now);
  await exportTimeBlocks(db, summary, options, now);
  return summary;
}

async function exportAppointmentRows(practiceId: string, db: PracticeScopedClient, rows: Row[], summary: ExportSummary, options: GoogleSyncOptions, now: Date) {

  const byConnection = new Map<string, Row[]>();
  for (const row of rows) {
    const calendar = row.professional.secondaryCalendar;
    if (!calendar) {
      // Unlinked meanwhile: nothing to write.
      await clearMark(db, row);
      continue;
    }
    byConnection.set(calendar.googleConnectionId, [...(byConnection.get(calendar.googleConnectionId) ?? []), row]);
  }

  for (const [connectionId, connectionRows] of byConnection) {
    let api: GoogleCalendarApi;
    try {
      api = await googleApiFor(connectionId, { ...options, now });
    } catch (error) {
      // Revoked or not active: the marks wait for the next link (rule 6).
      if (!isGoogleError(error)) throw error;
      summary.waiting += connectionRows.length;
      continue;
    }
    const goneCalendars = new Set<string>();
    for (const row of connectionRows) {
      const calendar = row.professional.secondaryCalendar!;
      if (goneCalendars.has(calendar.googleCalendarId)) {
        summary.waiting += 1;
        continue;
      }
      try {
        const written = await writeEvent(api, practiceId, row, calendar.googleCalendarId, now);
        await db.appointment.update({
          where: { id: row.id },
          data: {
            googleEventId: written?.eventId ?? null,
            googleEventUpdatedAt: written?.event.updated ?? null,
            googleSyncedAt: now,
            googleSyncError: null,
            googleSyncAttempts: 0,
          },
        });
        await clearMark(db, row);
        if (written) summary.exported += 1;
        else summary.deleted += 1;
      } catch (error) {
        if (error instanceof CalendarGone) {
          goneCalendars.add(calendar.googleCalendarId);
          await forgetCalendar(db, row, calendar);
          summary.waiting += 1;
          continue;
        }
        if (!(error instanceof GoogleError)) throw error;
        if (error.kind === "auth") {
          await forgetAccessToken(connectionId);
          summary.waiting += connectionRows.length;
          break;
        }
        const attempts = row.googleSyncAttempts + 1;
        const giveUp = error.kind !== "transient" || attempts >= EXPORT_MAX_ATTEMPTS;
        await db.appointment.update({ where: { id: row.id }, data: { googleSyncAttempts: attempts, googleSyncError: giveUp ? error.kind : null } });
        if (giveUp) {
          await clearMark(db, row);
          summary.failed += 1;
          console.warn(`Google export of appointment ${row.id} failed (${error.kind}): ${error.message}`);
        } else {
          summary.waiting += 1;
        }
      }
    }
  }
}

const BLOCK_SELECT = {
  id: true,
  startsAt: true,
  endsAt: true,
  professionalId: true,
  googleEventId: true,
  googleSyncRequestedAt: true,
  googleSyncAttempts: true,
  deletedAt: true,
  professional: { select: { secondaryCalendar: { select: { googleCalendarId: true, googleConnectionId: true } } } },
} as const;

/**
 * The manual blocks marked for export (D-85): the event says only "Bloqueado", without
 * the reason or anything about the practice. A removed block leaves with its event.
 */
async function exportTimeBlocks(db: PracticeScopedClient, summary: ExportSummary, options: GoogleSyncOptions, now: Date) {
  const rows = await db.timeBlock.findMany({ where: { source: "MANUAL", googleSyncRequestedAt: { not: null } }, orderBy: { googleSyncRequestedAt: "asc" }, take: EXPORT_BATCH, select: BLOCK_SELECT });
  if (rows.length === 0) return;
  const timeZone = await agendaTimeZone(db);
  const clear = (row: (typeof rows)[number]) => db.timeBlock.updateMany({ where: { id: row.id, googleSyncRequestedAt: row.googleSyncRequestedAt }, data: { googleSyncRequestedAt: null } });

  for (const row of rows) {
    const calendar = row.professional.secondaryCalendar;
    if (!calendar) {
      if (row.deletedAt) await db.timeBlock.delete({ where: { id: row.id } });
      else await clear(row);
      continue;
    }
    try {
      const api = await googleApiFor(calendar.googleConnectionId, { ...options, now });
      if (row.deletedAt) {
        if (row.googleEventId) {
          try {
            await api.deleteEvent(calendar.googleCalendarId, row.googleEventId);
          } catch (error) {
            if (!isGoogleError(error, "not_found")) throw error;
          }
        }
        await db.timeBlock.delete({ where: { id: row.id } });
        summary.deleted += 1;
        continue;
      }
      if (!row.googleEventId && row.endsAt <= now) {
        await clear(row);
        continue;
      }
      const input: EventInput = { summary: blockEventTitle(), description: "", location: "", start: row.startsAt, end: row.endsAt, timeZone, appointmentId: null };
      let written: { eventId: string; event: GoogleEvent } | null = null;
      if (row.googleEventId) {
        try {
          written = { eventId: row.googleEventId, event: await api.patchEvent(calendar.googleCalendarId, row.googleEventId, input) };
        } catch (error) {
          if (!isGoogleError(error, "not_found")) throw error;
        }
      }
      written ??= await insertOrPatch(api, calendar.googleCalendarId, row.googleEventId ?? eventIdFor(row.id), input);
      await db.timeBlock.update({ where: { id: row.id }, data: { googleCalendarId: calendar.googleCalendarId, googleEventId: written.eventId, googleSyncError: null, googleSyncAttempts: 0 } });
      await clear(row);
      summary.exported += 1;
    } catch (error) {
      if (error instanceof CalendarGone) {
        await forgetCalendar(db, row, calendar);
        summary.waiting += 1;
        continue;
      }
      if (!(error instanceof GoogleError)) throw error;
      if (error.kind === "auth") {
        await forgetAccessToken(calendar.googleConnectionId);
        summary.waiting += 1;
        continue;
      }
      const attempts = row.googleSyncAttempts + 1;
      const giveUp = error.kind !== "transient" || attempts >= EXPORT_MAX_ATTEMPTS;
      await db.timeBlock.update({ where: { id: row.id }, data: { googleSyncAttempts: attempts, googleSyncError: giveUp ? error.kind : null } });
      if (giveUp) {
        await clear(row);
        summary.failed += 1;
        console.warn(`Google export of block ${row.id} failed (${error.kind}): ${error.message}`);
      } else {
        summary.waiting += 1;
      }
    }
  }
}
