import type { CadenceAnchor } from "@/generated/prisma/enums";
import { addDays, todayIn, toZoned, weekdayOf, zonedToUtc, type IsoDate } from "@/lib/dates/zoned";

/**
 * When each cadence step fires (PRD 6, D-07). Pure: the same function plans the
 * dispatches of an appointment and draws the preview of the cadence editor.
 *
 * - Nominal time: "ao agendar" is the moment the cadence starts (the booking, or
 *   the batch activation of an imported appointment) plus the offset; a step
 *   anchored on the appointment is its start plus the offset, moved to `fixedTime`
 *   on that local day. Everything is read in the location's time zone (D-03).
 * - A step whose nominal time had already passed when the cadence started is skipped.
 * - Send window: a step before the appointment that falls outside it is anticipated
 *   to the last valid time before it; if that has passed too, it is postponed to the
 *   next valid time, as long as it stays `marginMinutes` before the appointment;
 *   otherwise it is skipped. Other steps ("ao agendar", after the appointment) are
 *   only postponed. The end of the window is a valid time.
 * - At most one automatic message per patient every 4 h: a step closer than that to
 *   another message (of this plan or `previousSends`) is postponed to the end of the
 *   interval, with the same window and margin, or skipped. The sender checks the
 *   limit again against what really went out.
 */

export const RATE_LIMIT_MS = 4 * 3_600_000;
const WEEK_DAYS = 7;

/** Days: 0 = Sunday, as Practice.sendWindowDays. Times "HH:mm" in the location's zone. */
export type SendWindow = { start: string; end: string; days: readonly number[] };

export type ScheduleStep = { id: string; anchor: CadenceAnchor; offsetMinutes: number; fixedTime: string | null };

export type PlanInput = {
  steps: readonly ScheduleStep[];
  /** The moment the cadence starts for the appointment. */
  startedAt: Date;
  startsAt: Date;
  timeZone: string;
  window: SendWindow;
  marginMinutes: number;
  /** Other automatic messages to the patient, sent or scheduled. */
  previousSends?: readonly Date[];
};

export type Adjustment = "none" | "anticipated" | "postponed" | "rate_limited";
export type SkipReason = "passed" | "outside_window" | "rate_limit";

export type PlannedStep =
  | { stepId: string; nominal: Date; at: Date; adjustment: Adjustment }
  | { stepId: string; nominal: Date; skipped: SkipReason };

export function nominalTime(step: Omit<ScheduleStep, "id">, startedAt: Date, startsAt: Date, timeZone: string) {
  if (step.anchor === "BOOKING") return new Date(startedAt.getTime() + step.offsetMinutes * 60_000);
  const moment = new Date(startsAt.getTime() + step.offsetMinutes * 60_000);
  return step.fixedTime ? zonedToUtc(toZoned(moment, timeZone).date, step.fixedTime, timeZone) : moment;
}

/** A step sent before the appointment can be anticipated; the others are only postponed. */
function isBeforeAppointment(step: Omit<ScheduleStep, "id">) {
  return step.anchor === "APPOINTMENT" && step.offsetMinutes < 0;
}

export function planSteps(input: PlanInput): PlannedStep[] {
  const { startedAt, startsAt, timeZone, window, marginMinutes } = input;
  const latestBeforeMargin = startsAt.getTime() - marginMinutes * 60_000;
  const taken: number[] = (input.previousSends ?? []).map((date) => date.getTime());
  const results = new Map<string, PlannedStep>();

  const ordered = input.steps
    .map((step) => ({ step, nominal: nominalTime(step, startedAt, startsAt, timeZone) }))
    .sort((a, b) => a.nominal.getTime() - b.nominal.getTime());

  for (const { step, nominal } of ordered) {
    const skip = (reason: SkipReason) => results.set(step.id, { stepId: step.id, nominal, skipped: reason });
    if (nominal < startedAt) {
      skip("passed");
      continue;
    }
    const before = nominal < startsAt;
    let at: number | null = nominal.getTime();
    let adjustment: Adjustment = "none";

    if (!isValid(at, timeZone, window)) {
      const anticipated = isBeforeAppointment(step) ? lastValidAtOrBefore(at, timeZone, window) : null;
      if (anticipated !== null && anticipated >= startedAt.getTime()) {
        at = anticipated;
        adjustment = "anticipated";
      } else {
        at = firstValidAtOrAfter(at, timeZone, window);
        adjustment = "postponed";
      }
    }
    if (at === null || (adjustment === "postponed" && before && at > latestBeforeMargin)) {
      skip("outside_window");
      continue;
    }

    // The 4 h limit: each push moves the step later, so the loop ends.
    let conflict = findConflict(at, taken);
    while (conflict !== undefined && at !== null) {
      at = firstValidAtOrAfter(conflict + RATE_LIMIT_MS, timeZone, window);
      adjustment = "rate_limited";
      conflict = at === null ? undefined : findConflict(at, taken);
    }
    if (at === null || (adjustment === "rate_limited" && before && at > latestBeforeMargin)) {
      skip("rate_limit");
      continue;
    }

    taken.push(at);
    results.set(step.id, { stepId: step.id, nominal, at: new Date(at), adjustment });
  }

  return input.steps.map((step) => results.get(step.id)!);
}

function findConflict(at: number, taken: readonly number[]) {
  return taken.find((other) => Math.abs(at - other) < RATE_LIMIT_MS);
}

// ---------------------------------------------------------------------------
// Send window, in the location's time zone
// ---------------------------------------------------------------------------

function minutesOf(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/** Milliseconds since local midnight of the instant's local day. */
function localMs(instant: number, timeZone: string) {
  const parts = toZoned(new Date(instant), timeZone);
  return { date: parts.date, ms: instant - zonedToUtc(parts.date, "00:00", timeZone).getTime() };
}

function isValidDay(date: IsoDate, window: SendWindow) {
  return window.days.includes(weekdayOf(date));
}

export function isValid(instant: number, timeZone: string, window: SendWindow) {
  const { date, ms } = localMs(instant, timeZone);
  return isValidDay(date, window) && ms >= minutesOf(window.start) * 60_000 && ms <= minutesOf(window.end) * 60_000;
}

/** The last valid instant at or before `instant`, or null if the window has no day. */
function lastValidAtOrBefore(instant: number, timeZone: string, window: SendWindow): number | null {
  if (isValid(instant, timeZone, window)) return instant;
  const { date, ms } = localMs(instant, timeZone);
  if (isValidDay(date, window) && ms > minutesOf(window.end) * 60_000) return zonedToUtc(date, window.end, timeZone).getTime();
  for (let back = 1; back <= WEEK_DAYS; back += 1) {
    const day = addDays(date, -back);
    if (isValidDay(day, window)) return zonedToUtc(day, window.end, timeZone).getTime();
  }
  return null;
}

/** The first valid instant at or after `instant`, or null if the window has no day. */
function firstValidAtOrAfter(instant: number, timeZone: string, window: SendWindow): number | null {
  if (isValid(instant, timeZone, window)) return instant;
  const { date, ms } = localMs(instant, timeZone);
  if (isValidDay(date, window) && ms < minutesOf(window.start) * 60_000) return zonedToUtc(date, window.start, timeZone).getTime();
  for (let ahead = 1; ahead <= WEEK_DAYS; ahead += 1) {
    const day = addDays(date, ahead);
    if (isValidDay(day, window)) return zonedToUtc(day, window.start, timeZone).getTime();
  }
  return null;
}

/** The next valid instant at or after `instant` (for the sender's postponements). */
export function nextValidTime(instant: Date, timeZone: string, window: SendWindow) {
  const at = firstValidAtOrAfter(instant.getTime(), timeZone, window);
  return at === null ? null : new Date(at);
}

/** The fictitious appointment of the preview: next Tuesday at 10h (PRD 6, rule 6). */
export function nextTuesdayAt10(timeZone: string, now = new Date()) {
  const today = todayIn(timeZone, now);
  const ahead = (2 - weekdayOf(today) + WEEK_DAYS) % WEEK_DAYS || WEEK_DAYS;
  return zonedToUtc(addDays(today, ahead), "10:00", timeZone);
}

