import type { AppointmentStatus } from "@/generated/prisma/enums";
import { CANCELED_STATUSES } from "@/lib/appointments/status";
import { addDays, isIsoDate, zonedToUtc } from "@/lib/dates/zoned";
import { STATUS_LABELS } from "@/lib/domain/labels";
import type { GoogleEvent } from "./provider";

/**
 * The pure rules of the Google sync (PRD 5; D-14, D-15, D-60, D-62), tested
 * without a database: what the system writes in the secondary calendar, which
 * calendars count as busy and which Google events become a block.
 */

/** PRD 5, rule 7, kept moving at every read (D-15, D-61). */
export const SYNC_WINDOW_DAYS = 90;

const DAY_MS = 86_400_000;

/** Calendars the professional can write to count as busy by default (PRD 5, rule 1). */
const WRITABLE_ROLES = new Set(["owner", "writer"]);

/** Google events that never block: a working location or a contact's birthday is not an appointment. */
const IGNORED_EVENT_TYPES = new Set(["workingLocation", "birthday"]);

export function syncWindow(now: Date) {
  return { timeMin: now, timeMax: new Date(now.getTime() + SYNC_WINDOW_DAYS * DAY_MS) };
}

export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? "";
}

/**
 * "Carlos · Procedimento (Agendado)": first name, the type's display name (D-14)
 * and the status. An erased patient's event has no name at all (D-28).
 */
export function eventTitle(input: { patientName: string; anonymized: boolean; typeLabel: string; status: AppointmentStatus }) {
  const what = `${input.typeLabel} (${STATUS_LABELS[input.status]})`;
  return input.anonymized ? what : `${firstName(input.patientName)} · ${what}`;
}

/** No personal data: the link leads to the system, where the appointment lives. */
export function eventDescription(appointmentUrl: string) {
  return [
    "Agendamento criado pela agenda do consultório.",
    "Mudanças feitas aqui ficam pendentes até a secretária ou você aceitar ou reverter.",
    appointmentUrl,
  ].join("\n");
}

/** Canceled and rescheduled appointments free the time: their event goes (D-62). */
export function keepsEvent(status: AppointmentStatus) {
  return status !== "RESCHEDULED" && !(CANCELED_STATUSES as readonly AppointmentStatus[]).includes(status);
}

/**
 * The event id the system gives an appointment's event: the UUID's hex digits fit
 * Google's alphabet (base32hex, a–v and 0–9), and a fixed id makes the insert idempotent.
 */
/** A manual block's event says nothing else: the reason stays in the agenda (D-85). */
export function blockEventTitle() {
  return "Bloqueado";
}

export function eventIdFor(appointmentId: string) {
  return appointmentId.replace(/-/g, "").toLowerCase();
}

/**
 * The calendars whose events block the professional (D-15, D-60): until they
 * choose, every calendar they can write to; after, their list. The practice's own
 * secondary calendar is output only and never counts; another practice's does.
 */
export function busyCalendarIds(input: {
  calendars: readonly { googleCalendarId: string; accessRole: string }[];
  ownSecondaryId: string | null;
  chosen: boolean;
  chosenIds: readonly string[];
}) {
  const chosen = new Set(input.chosenIds);
  return input.calendars
    .filter((calendar) => calendar.googleCalendarId !== input.ownSecondaryId)
    .filter((calendar) => (input.chosen ? chosen.has(calendar.googleCalendarId) : WRITABLE_ROLES.has(calendar.accessRole)))
    .map((calendar) => calendar.googleCalendarId);
}

function isAllDay(event: GoogleEvent) {
  return Boolean(event.start && "date" in event.start);
}

/**
 * The block a Google event becomes, or null (D-15): a busy event blocks; a free one
 * does not, except an all-day event while the professional keeps that rule on,
 * because Google creates them free. An all-day event spans whole days in the
 * agenda's time zone. Nothing of the event's content is kept.
 */
export function blockFromEvent(event: GoogleEvent, options: { allDayEventsBlock: boolean; timeZone: string }) {
  if (event.status === "cancelled" || event.declinedBySelf || IGNORED_EVENT_TYPES.has(event.eventType)) return null;
  if (!event.start || !event.end) return null;
  const allDay = isAllDay(event);
  if (event.transparency === "transparent" && !(allDay && options.allDayEventsBlock)) return null;

  let startsAt: Date;
  let endsAt: Date;
  if ("date" in event.start && "date" in event.end) {
    if (!isIsoDate(event.start.date) || !isIsoDate(event.end.date)) return null;
    startsAt = zonedToUtc(event.start.date, "00:00", options.timeZone);
    endsAt = zonedToUtc(event.end.date > event.start.date ? event.end.date : addDays(event.start.date, 1), "00:00", options.timeZone);
  } else if ("dateTime" in event.start && "dateTime" in event.end) {
    startsAt = event.start.dateTime;
    endsAt = event.end.dateTime;
  } else {
    return null;
  }
  return endsAt > startsAt ? { startsAt, endsAt, allDay } : null;
}

/** A timed event at exactly the appointment's times. */
export function sameTimes(event: GoogleEvent, startsAt: Date, endsAt: Date) {
  return (
    Boolean(event.start && "dateTime" in event.start && event.end && "dateTime" in event.end) &&
    (event.start as { dateTime: Date }).dateTime.getTime() === startsAt.getTime() &&
    (event.end as { dateTime: Date }).dateTime.getTime() === endsAt.getTime()
  );
}

/** The new times of an event of the system moved in Google; null when it is not timed. */
export function timesOf(event: GoogleEvent) {
  if (!event.start || !event.end || !("dateTime" in event.start) || !("dateTime" in event.end)) return null;
  return { startsAt: event.start.dateTime, endsAt: event.end.dateTime };
}
