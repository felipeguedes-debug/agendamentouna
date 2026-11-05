import { addDays, formatDateBr, weekdayOf, type IsoDate } from "@/lib/dates/zoned";

/**
 * The Pendências list: what waits for someone, in one place, by date (D-84). Pure, so
 * the screen and the tests share it; the rows come from `pending.ts`.
 */

export const PENDING_FILTERS = ["todas", "sem-confirmacao", "respostas", "google", "sem-baixa"] as const;
export type PendingFilter = (typeof PENDING_FILTERS)[number];

export const PENDING_FILTER_LABELS: Record<PendingFilter, string> = {
  todas: "Todas",
  "sem-confirmacao": "Sem confirmação",
  respostas: "Respostas",
  google: "Google",
  "sem-baixa": "Sem baixa",
};

export type PendingReason = "unconfirmed" | "reschedule_requested" | "replied" | "google_change" | "google_conflict" | "without_closing";

const FILTER_OF_REASON: Record<PendingReason, Exclude<PendingFilter, "todas">> = {
  unconfirmed: "sem-confirmacao",
  reschedule_requested: "respostas",
  replied: "respostas",
  google_change: "google",
  google_conflict: "google",
  without_closing: "sem-baixa",
};

export function parsePendingFilter(value: string | string[] | undefined): PendingFilter {
  const text = Array.isArray(value) ? value[0] : value;
  return PENDING_FILTERS.includes(text as PendingFilter) ? (text as PendingFilter) : "todas";
}

export function countByFilter(rows: readonly { reason: PendingReason }[]): Record<PendingFilter, number> {
  const counts: Record<PendingFilter, number> = { todas: rows.length, "sem-confirmacao": 0, respostas: 0, google: 0, "sem-baixa": 0 };
  for (const row of rows) counts[FILTER_OF_REASON[row.reason]] += 1;
  return counts;
}

export function rowsFor<T extends { reason: PendingReason }>(rows: readonly T[], filter: PendingFilter): T[] {
  return filter === "todas" ? [...rows] : rows.filter((row) => FILTER_OF_REASON[row.reason] === filter);
}

/** The secretary's time counts while the unconfirmed appointments are on the screen (D-75, D-84). */
export function showsConfirmationWork(rows: readonly { reason: PendingReason }[], filter: PendingFilter) {
  return rowsFor(rows, filter).some((row) => row.reason === "unconfirmed");
}

const WEEKDAYS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function dayLabel(date: IsoDate, today: IsoDate) {
  const label = `${WEEKDAYS[weekdayOf(date)]} ${formatDateBr(date).slice(0, 5)}`;
  if (date === today) return `Hoje, ${label}`;
  if (date === addDays(today, 1)) return `Amanhã, ${label}`;
  return capitalize(label);
}

/** Today and ahead by date; everything before today in one group, at the end. */
export function groupByDay<T extends { date: IsoDate }>(rows: readonly T[], today: IsoDate) {
  const byDate = (first: T, second: T) => first.date.localeCompare(second.date);
  const ahead = rows.filter((row) => row.date >= today).sort(byDate);
  const past = rows.filter((row) => row.date < today).sort(byDate);
  const groups: { key: string; label: string; rows: T[] }[] = [];
  for (const row of ahead) {
    const last = groups.at(-1);
    if (last?.key === row.date) last.rows.push(row);
    else groups.push({ key: row.date, label: dayLabel(row.date, today), rows: [row] });
  }
  if (past.length > 0) groups.push({ key: "past", label: "Dias anteriores", rows: past });
  return groups;
}
