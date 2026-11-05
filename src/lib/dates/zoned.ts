/**
 * Wall-clock dates and times in a location's time zone (D-03), with Intl only.
 * Instants are Dates in UTC, as stored in the database; calendar days are ISO
 * strings ("2026-10-21") with no time zone of their own.
 */

export const DEFAULT_TIME_ZONE = "America/Fortaleza";

/** A calendar day, "YYYY-MM-DD". */
export type IsoDate = string;

export type ZonedParts = { date: IsoDate; time: string; hour: number; minute: number; weekday: number };

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string) {
  let formatter = partsFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsFormatters.set(timeZone, formatter);
  }
  return formatter;
}

function wallClock(instant: Date, timeZone: string) {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return values as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Milliseconds the wall clock of `timeZone` is ahead of UTC at `instant`. */
function offsetAt(instant: Date, timeZone: string) {
  const clock = wallClock(instant, timeZone);
  const asUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function fromUtcDay(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

function utcDay(date: IsoDate) {
  const [, year, month, day] = ISO_DATE.exec(date) ?? [];
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
}

export function isIsoDate(value: string): value is IsoDate {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  return fromUtcDay(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) === value;
}

export function isTime(value: string) {
  return TIME.test(value);
}

export function toZoned(instant: Date, timeZone: string): ZonedParts {
  const clock = wallClock(instant, timeZone);
  const date = `${clock.year}-${pad(clock.month)}-${pad(clock.day)}`;
  return {
    date,
    time: `${pad(clock.hour)}:${pad(clock.minute)}`,
    hour: clock.hour,
    minute: clock.minute,
    weekday: new Date(utcDay(date)).getUTCDay(),
  };
}

/** The instant at which the wall clock of `timeZone` shows `date` at `time` ("HH:mm"). */
export function zonedToUtc(date: IsoDate, time: string, timeZone: string): Date {
  const [hour, minute] = time.split(":").map(Number);
  const guess = utcDay(date) + (hour * 60 + minute) * 60_000;
  const first = guess - offsetAt(new Date(guess), timeZone);
  const second = guess - offsetAt(new Date(first), timeZone);
  return new Date(second);
}

export function startOfZonedDay(date: IsoDate, timeZone: string) {
  return zonedToUtc(date, "00:00", timeZone);
}

export function todayIn(timeZone: string, now = new Date()): IsoDate {
  return toZoned(now, timeZone).date;
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtcDay(utcDay(date) + days * DAY_MS);
}

/** First day of the month `months` after the month of `date`. */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const day = new Date(utcDay(date));
  return fromUtcDay(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + months, 1));
}

export function firstOfMonth(date: IsoDate): IsoDate {
  return addMonths(date, 0);
}

/** 0 = Sunday, as in WorkingHours.weekday. */
export function weekdayOf(date: IsoDate) {
  return new Date(utcDay(date)).getUTCDay();
}

export function mondayOf(date: IsoDate): IsoDate {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

/** Days from `start` up to, but not including, `endExclusive`. */
export function eachDay(start: IsoDate, endExclusive: IsoDate): IsoDate[] {
  const days: IsoDate[] = [];
  for (let day = start; day < endExclusive; day = addDays(day, 1)) days.push(day);
  return days;
}

// ---------------------------------------------------------------------------
// pt-BR formatting. Calendar days are formatted at noon UTC, so no zone shifts them.
// ---------------------------------------------------------------------------

const timeFormatters = new Map<string, Intl.DateTimeFormat>();
const WEEKDAYS_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const longDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const dayMonth = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "long" });
const monthYear = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long", year: "numeric" });

function noon(date: IsoDate) {
  return new Date(utcDay(date) + DAY_MS / 2);
}

/** "08:00" on the wall clock of `timeZone`. */
export function formatTime(instant: Date, timeZone: string) {
  let formatter = timeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    timeFormatters.set(timeZone, formatter);
  }
  return formatter.format(instant);
}

/** "21/10/2026" */
export function formatDateBr(date: IsoDate) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** "Qua 21" */
export function formatDayLabel(date: IsoDate) {
  return `${WEEKDAYS_SHORT[weekdayOf(date)]} ${Number(date.slice(8))}`;
}

/** "quarta-feira, 21 de outubro de 2026" */
export function formatLongDate(date: IsoDate) {
  return longDate.format(noon(date));
}

/** "outubro de 2026" */
export function formatMonthTitle(date: IsoDate) {
  return monthYear.format(noon(date));
}

/** "19 a 23 de outubro de 2026", spelling out the month and year only where they change. */
export function formatWeekRange(start: IsoDate, end: IsoDate) {
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  const sameMonth = sameYear && start.slice(5, 7) === end.slice(5, 7);
  const endText = `${dayMonth.format(noon(end))} de ${end.slice(0, 4)}`;
  if (sameMonth) return `${Number(start.slice(8))} a ${endText}`;
  if (sameYear) return `${dayMonth.format(noon(start))} a ${endText}`;
  return `${dayMonth.format(noon(start))} de ${start.slice(0, 4)} a ${endText}`;
}
