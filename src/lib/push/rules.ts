import { addDays, formatDateBr, formatTime, toZoned } from "@/lib/dates/zoned";

/**
 * The confirmation notice (PRD 7, D-78). It appears on a locked screen, and the existence
 * of a visit is sensitive data (PRD 7), so it tells only the time: never the patient,
 * the type, the location or the practice's name.
 */

export const PUSH_TITLE = "Agenda";

/** A notice is worth nothing after the visit, and push services hold it at most this long. */
const MAX_TTL_SECONDS = 24 * 60 * 60;

export function confirmationPushBody(startsAt: Date, timeZone: string, now: Date) {
  const time = formatTime(startsAt, timeZone);
  const day = toZoned(startsAt, timeZone).date;
  const today = toZoned(now, timeZone).date;
  if (day === today) return `Um paciente confirmou o horário das ${time}.`;
  if (day === addDays(today, 1)) return `Um paciente confirmou o horário de amanhã, às ${time}.`;
  return `Um paciente confirmou o horário de ${formatDateBr(day)}, às ${time}.`;
}

export function pushTtlSeconds(startsAt: Date, now: Date) {
  return Math.max(0, Math.min(MAX_TTL_SECONDS, Math.floor((startsAt.getTime() - now.getTime()) / 1000)));
}
