import type { AppointmentStatus, DispatchStatus } from "@/generated/prisma/enums";
import { OPEN_STATUSES, PREDICTED_STATUSES } from "@/lib/appointments/status";
import { addDays, eachDay, mondayOf, toZoned, weekdayOf, zonedToUtc, type IsoDate } from "@/lib/dates/zoned";

/**
 * The indicators of PRD 8, without the database (D-74, D-75). Each function takes the
 * facts already read and answers with counts; a ratio with nothing to divide by has
 * no value, which the panel shows as "Sem dados" and never as zero.
 */

export type Ratio = { numerator: number; denominator: number; value: number | null };

export function ratio(numerator: number, denominator: number): Ratio {
  return { numerator, denominator, value: denominator === 0 ? null : numerator / denominator };
}

/** One appointment of the period; `dayOver` says its local day has ended (D-13). */
export type AppointmentFact = { status: AppointmentStatus; dayOver: boolean; typeId: string; typeName: string; priceCents: number };

function isWithoutClosing({ status, dayOver }: Pick<AppointmentFact, "status" | "dayOver">) {
  return dayOver && (OPEN_STATUSES as readonly AppointmentStatus[]).includes(status);
}

/** Faltou ÷ (Atendido + Faltou); Sem baixa stays out of the rate and is told apart (D-13). */
export function noShowRate(facts: readonly Pick<AppointmentFact, "status" | "dayOver">[]) {
  let completed = 0;
  let noShow = 0;
  let withoutClosing = 0;
  for (const fact of facts) {
    if (fact.status === "COMPLETED") completed += 1;
    else if (fact.status === "NO_SHOW") noShow += 1;
    else if (isWithoutClosing(fact)) withoutClosing += 1;
  }
  return { completed, noShow, withoutClosing, rate: ratio(noShow, completed + noShow) };
}

/** The same by type, only the types with something to show, the most no-shows first. */
export function noShowByType(facts: readonly AppointmentFact[]) {
  const byType = new Map<string, AppointmentFact[]>();
  for (const fact of facts) byType.set(fact.typeId, [...(byType.get(fact.typeId) ?? []), fact]);
  return [...byType.entries()]
    .map(([typeId, rows]) => ({ typeId, typeName: rows[0].typeName, ...noShowRate(rows) }))
    .filter((row) => row.completed + row.noShow + row.withoutClosing > 0)
    .sort((a, b) => b.noShow - a.noShow || a.typeName.localeCompare(b.typeName, "pt-BR"));
}

/** The definitions of the agenda panel (D-13), so the two never disagree. */
export function valueRealization(facts: readonly AppointmentFact[]) {
  let predictedCents = 0;
  let realizedCents = 0;
  let withoutClosingCents = 0;
  for (const fact of facts) {
    if ((PREDICTED_STATUSES as readonly AppointmentStatus[]).includes(fact.status)) predictedCents += fact.priceCents;
    if (fact.status === "COMPLETED") realizedCents += fact.priceCents;
    if (isWithoutClosing(fact)) withoutClosingCents += fact.priceCents;
  }
  return { predictedCents, realizedCents, withoutClosingCents, rate: ratio(realizedCents, predictedCents) };
}

export type RequestFact = { status: DispatchStatus; sent: boolean };
export type ConfirmationFact = { status: AppointmentStatus; confirmedByReply: boolean; requests: readonly RequestFact[] };

/**
 * The cadence could ask this patient (D-74): a confirmation request planned for it and
 * not skipped at planning. Rescheduled gives way to the new appointment, and an
 * appointment canceled counts only if the request had already gone out.
 */
function isEligibleForConfirmation({ status, confirmedByReply, requests }: ConfirmationFact) {
  if (confirmedByReply) return true;
  if (status === "RESCHEDULED") return false;
  const planned = requests.filter((request) => request.status !== "SKIPPED");
  if (status === "CANCELED_BY_PATIENT" || status === "CANCELED_BY_PRACTICE") return planned.some((request) => request.sent);
  return planned.length > 0;
}

/** Confirmados via WhatsApp ÷ agendamentos elegíveis à régua. */
export function confirmationRate(facts: readonly ConfirmationFact[]) {
  const eligible = facts.filter(isEligibleForConfirmation);
  return ratio(eligible.filter((fact) => fact.confirmedByReply).length, eligible.length);
}

const DELIVERED_STATUSES: readonly DispatchStatus[] = ["DELIVERED", "READ"];

/** Entregues ÷ enviados; what never left is not "sent", and is told apart. */
export function deliveryRate(dispatches: readonly RequestFact[]) {
  const sent = dispatches.filter((dispatch) => dispatch.sent);
  return {
    rate: ratio(sent.filter((dispatch) => DELIVERED_STATUSES.includes(dispatch.status)).length, sent.length),
    neverSent: dispatches.filter((dispatch) => !dispatch.sent && dispatch.status === "FAILED").length,
  };
}

/** Profissionais com vínculo ativo ÷ profissionais cadastrados. */
export function googleCoverage(links: readonly ("none" | "active" | "revoked" | "error")[]) {
  return ratio(links.filter((link) => link === "active").length, links.length);
}

/** Eventos com erro ÷ eventos que a exportação alcançou. Google only (D-74). */
export function syncFailureRate(events: readonly { syncedAt: Date | null; error: string | null }[]) {
  const reached = events.filter((event) => event.syncedAt || event.error);
  return ratio(reached.filter((event) => event.error).length, reached.length);
}

type Interval = { start: number; end: number };

function merged(intervals: readonly Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const interval of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = result.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else if (interval.end > interval.start) result.push({ ...interval });
  }
  return result;
}

function without(intervals: readonly Interval[], holes: readonly Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const interval of intervals) {
    let start = interval.start;
    for (const hole of holes) {
      if (hole.end <= start || hole.start >= interval.end) continue;
      if (hole.start > start) result.push({ start, end: hole.start });
      start = Math.max(start, hole.end);
    }
    if (start < interval.end) result.push({ start, end: interval.end });
  }
  return result;
}

function minutesOf(intervals: readonly Interval[]) {
  return intervals.reduce((total, { start, end }) => total + (end - start) / 60_000, 0);
}

function overlap(a: readonly Interval[], b: readonly Interval[]): Interval[] {
  const result: Interval[] = [];
  for (const left of a) {
    for (const right of b) {
      const start = Math.max(left.start, right.start);
      const end = Math.min(left.end, right.end);
      if (start < end) result.push({ start, end });
    }
  }
  return result;
}

export type OccupancyInput = {
  period: { start: IsoDate; endExclusive: IsoDate };
  workingHours: readonly { weekday: number; startTime: string; endTime: string; timeZone: string; locationId: string }[];
  exceptions: readonly { startsOn: IsoDate; endsOn: IsoDate; locationId: string | null }[];
  blocks: readonly { startsAt: Date; endsAt: Date }[];
  appointments: readonly { startsAt: Date; endsAt: Date }[];
};

const toInterval = ({ startsAt, endsAt }: { startsAt: Date; endsAt: Date }): Interval => ({ start: startsAt.getTime(), end: endsAt.getTime() });

/**
 * Horários ocupados ÷ horários disponíveis of one professional, in minutes (D-74).
 * Available is the working hours of each day, in the location's time zone, without
 * exceptions and blocks. What falls outside them does not count, so it stays within 100%.
 */
export function occupancy({ period, workingHours, exceptions, blocks, appointments }: OccupancyInput) {
  const windows: Interval[] = [];
  for (const day of eachDay(period.start, period.endExclusive)) {
    const weekday = weekdayOf(day);
    for (const hours of workingHours) {
      if (hours.weekday !== weekday) continue;
      const excepted = exceptions.some(
        (exception) => exception.startsOn <= day && day <= exception.endsOn && (exception.locationId === null || exception.locationId === hours.locationId),
      );
      if (excepted) continue;
      windows.push({ start: zonedToUtc(day, hours.startTime, hours.timeZone).getTime(), end: zonedToUtc(day, hours.endTime, hours.timeZone).getTime() });
    }
  }
  const available = without(merged(windows), merged(blocks.map(toInterval)));
  const occupied = overlap(available, merged(appointments.map(toInterval)));
  const availableMinutes = minutesOf(available);
  const occupiedMinutes = minutesOf(occupied);
  return { occupiedMinutes, availableMinutes, rate: ratio(occupiedMinutes, availableMinutes) };
}

/** Days of use a practice needs in a week (PRD 8, "Adoção por conta"). */
export const ADOPTION_MIN_DAYS = 5;

/** The last Monday-to-Sunday week already over: the current one would always fall short. */
export function lastCompleteWeek(today: IsoDate) {
  const monday = addDays(mondayOf(today), -7);
  return { start: monday, endExclusive: addDays(monday, 7) };
}

const SUNDAY = 0;

/** Distinct working days, Monday to Saturday in the practice's zone, with a user's action (D-75). */
export function usageDays(events: readonly Date[], week: { start: IsoDate; endExclusive: IsoDate }, timeZone: string) {
  const days = new Set<IsoDate>();
  for (const event of events) {
    const { date, weekday } = toZoned(event, timeZone);
    if (weekday !== SUNDAY && week.start <= date && date < week.endExclusive) days.add(date);
  }
  return days.size;
}

/** Contas com 5+ dias de uso ÷ contas em uso. `null`: a practice nobody has ever used (D-75). */
export function adoptionRate(daysPerPractice: readonly (number | null)[]) {
  const used = daysPerPractice.filter((days): days is number => days !== null);
  return ratio(used.filter((days) => days >= ADOPTION_MIN_DAYS).length, used.length);
}

const BASELINE_DAYS = 7;
const MIN_DAYS_TO_COMPARE = 14;

function perDay(rows: readonly { date: IsoDate; minutes: number }[]) {
  const days = new Set(rows.map((row) => row.date));
  return { days, average: days.size === 0 ? null : rows.reduce((total, row) => total + row.minutes, 0) / days.size };
}

/**
 * Minutos por dia on the "Sem confirmação" list, against the start: the first 7 measured
 * days, once 14 days give that a meaning (D-75). No measurement, no number.
 */
export function confirmationWork({ inPeriod, all }: { inPeriod: readonly { date: IsoDate; minutes: number }[]; all: readonly { date: IsoDate; minutes: number }[] }) {
  const current = perDay(inPeriod);
  const measured = [...new Set(all.map((row) => row.date))].sort();
  const firstDays = new Set(measured.slice(0, BASELINE_DAYS));
  const baselinePerDay = perDay(all.filter((row) => firstDays.has(row.date))).average;
  const comparable = measured.length >= MIN_DAYS_TO_COMPARE && current.average !== null && baselinePerDay;
  return {
    minutesPerDay: current.average,
    measuredDays: current.days.size,
    baselinePerDay,
    dropRate: comparable ? 1 - current.average! / baselinePerDay : null,
  };
}

export type IndicatorKey = "noShow" | "autoConfirmation" | "confirmationTime" | "googleCoverage" | "syncFailures" | "delivery" | "occupancy" | "realization" | "adoption";

/** The "Meta em 90 dias" column of PRD 8. Ocupação has none: "Acompanhar; meta por conta". */
const TARGETS: Record<Exclude<IndicatorKey, "occupancy">, (value: number) => boolean> = {
  noShow: (value) => value < 0.1,
  autoConfirmation: (value) => value > 0.7,
  confirmationTime: (value) => value >= 0.6,
  googleCoverage: (value) => value > 0.8,
  syncFailures: (value) => value < 0.005,
  delivery: (value) => value > 0.95,
  realization: (value) => value > 0.85,
  adoption: (value) => value > 0.9,
};

export function targetStatus(key: IndicatorKey, value: number | null) {
  if (key === "occupancy") return "no_target" as const;
  if (value === null) return "no_data" as const;
  return TARGETS[key](value) ? ("on_target" as const) : ("off_target" as const);
}

export const INDICATOR_PERIODS = [7, 30, 90] as const;
const DEFAULT_PERIOD = 30;

/** The last `dias` days through today, from the URL; anything else is the default. */
export function parseIndicatorPeriod(params: { dias?: string | string[] }, today: IsoDate) {
  const requested = typeof params.dias === "string" ? Number(params.dias) : NaN;
  const days = (INDICATOR_PERIODS as readonly number[]).includes(requested) ? requested : DEFAULT_PERIOD;
  return { days, start: addDays(today, 1 - days), endExclusive: addDays(today, 1) };
}
