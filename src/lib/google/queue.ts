import { forPractice, type PracticeScopedClient, type PracticeTransaction } from "@/lib/db";
import { sendWithoutWaiting } from "@/lib/inngest/client";

/**
 * The export queue to Google (D-62), kept small so the appointment services can
 * use it without loading the Google client:
 *
 * - inside the transaction that books, changes the status, reschedules, imports,
 *   erases or resolves a pending change, `markForGoogleSync` marks the appointments
 *   whose professional has a secondary calendar in the practice;
 * - after the commit, `requestGoogleSync` asks Inngest to export them now (PRD 7:
 *   in Google within 30 s); the minute tick picks up whatever it misses.
 */

/** Exports the marked appointments of one practice (src/lib/inngest/functions.ts). */
export const GOOGLE_EXPORT_EVENT = "google/appointments.export";

type Db = PracticeTransaction | PracticeScopedClient;

export async function markForGoogleSync(db: Db, appointmentIds: readonly string[], now = new Date()) {
  if (appointmentIds.length === 0) return 0;
  const { count } = await db.appointment.updateMany({
    where: { id: { in: [...appointmentIds] }, professional: { is: { secondaryCalendar: { isNot: null } } } },
    data: { googleSyncRequestedAt: now, googleSyncAttempts: 0, googleSyncError: null },
  });
  return count;
}

/**
 * Asks Inngest to export the appointments among `appointmentIds` that are marked.
 * Not reaching Inngest is not an error: the minute tick finds them.
 */
export async function requestGoogleSync(practiceId: string, appointmentIds: readonly string[], db: PracticeScopedClient = forPractice(practiceId)) {
  if (appointmentIds.length === 0) return;
  const marked = await db.appointment.findMany({ where: { id: { in: [...appointmentIds] }, googleSyncRequestedAt: { not: null } }, select: { id: true } });
  if (marked.length === 0) return;
  const markedIds = new Set(marked.map((row) => row.id));
  sendWithoutWaiting({ name: GOOGLE_EXPORT_EVENT, data: { practiceId, appointmentIds: appointmentIds.filter((id) => markedIds.has(id)) } }, `Inngest unreachable; the next tick exports practice ${practiceId}'s appointments to Google`);
}

/**
 * Asks Inngest to export the practice's marked manual blocks (D-85), which go with the
 * appointments' export. Not reaching Inngest is not an error: the minute tick finds them.
 */
export async function requestBlockGoogleSync(practiceId: string) {
  sendWithoutWaiting({ name: GOOGLE_EXPORT_EVENT, data: { practiceId, appointmentIds: [] } }, `Inngest unreachable; the next tick exports practice ${practiceId}'s blocks to Google`);
}

/** Reads a connection's calendars (and creates missing secondary calendars) now. */
export const GOOGLE_CONNECTION_SYNC_EVENT = "google/connection.sync";

/**
 * Asks Inngest to sync the connection now (a new link, a new busy choice) instead
 * of waiting for the 4-minute polling, which finds it anyway.
 */
export async function requestConnectionSync(connectionId: string) {
  sendWithoutWaiting({ name: GOOGLE_CONNECTION_SYNC_EVENT, data: { connectionId } }, `Inngest unreachable; the polling syncs Google connection ${connectionId}`);
}

/** Google pushed a change of one calendar (GoogleCalendar.id) of a connection. */
export const GOOGLE_CALENDAR_CHANGED_EVENT = "google/calendar.changed";

/** The push webhook asks for the calendar to be read; the polling covers a miss. */
export async function requestCalendarSync(calendarId: string, connectionId: string) {
  sendWithoutWaiting({ name: GOOGLE_CALENDAR_CHANGED_EVENT, data: { calendarId, connectionId } }, `Inngest unreachable; the polling reads Google calendar ${calendarId}`);
}

/**
 * The appointment changed in the system before anyone resolved its pending Google
 * change: the system's version wins and the export puts it back in Google (D-63).
 * `except` is the change being accepted.
 */
export async function supersedeGoogleChanges(db: Db, appointmentId: string, now: Date, except?: string) {
  await db.pendingGoogleChange.updateMany({
    where: { appointmentId, resolvedAt: null, ...(except ? { id: { not: except } } : {}) },
    data: { resolution: "SUPERSEDED", resolvedAt: now },
  });
}
