import type { AppointmentCategory, AppointmentStatus } from "@/generated/prisma/enums";
import { STATUSES } from "@/lib/appointments/status";
import { isIsoDate, isTime, type IsoDate } from "@/lib/dates/zoned";
import { CATEGORY_LABELS } from "@/lib/domain/labels";

/**
 * The agenda keeps its state in the URL (D-41), so every view can be linked and
 * reloaded: ?visao=dia|semana|mes|lista&data=AAAA-MM-DD&profissional=<id>&categoria=…&status=…
 * Anything invalid falls back to the default. Pure, so client components use it too.
 */

export const AGENDA_VIEWS = ["dia", "semana", "mes", "lista"] as const;
export type AgendaView = (typeof AGENDA_VIEWS)[number];

/** A status, or "Sem confirmação": Agendado with the unanswered-cadence flag open. */
export type StatusFilter = AppointmentStatus | "NO_CONFIRMATION";

export type AgendaFilters = {
  /** null: every professional the user may see. */
  professionalId: string | null;
  category: AppointmentCategory | null;
  status: StatusFilter | null;
};

export type AgendaQuery = AgendaFilters & { view: AgendaView; date: IsoDate };

type SearchParams = Record<string, string | string[] | undefined>;

const CATEGORIES = Object.keys(CATEGORY_LABELS) as AppointmentCategory[];
const STATUS_FILTERS: readonly StatusFilter[] = [...STATUSES, "NO_CONFIRMATION"];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseAgendaParams(params: SearchParams, today: IsoDate, defaultView: AgendaView = "semana"): AgendaQuery {
  const view = first(params.visao);
  const date = first(params.data);
  const professional = first(params.profissional);
  const category = first(params.categoria);
  const status = first(params.status);
  return {
    view: AGENDA_VIEWS.includes(view as AgendaView) ? (view as AgendaView) : defaultView,
    date: date && isIsoDate(date) ? date : today,
    professionalId: professional && professional !== "todos" ? professional : null,
    category: CATEGORIES.includes(category as AppointmentCategory) ? (category as AppointmentCategory) : null,
    status: STATUS_FILTERS.includes(status as StatusFilter) ? (status as StatusFilter) : null,
  };
}

/** The agenda URL for a query; `defaults` are left out to keep links short. */
export function agendaHref(practiceId: string, query: AgendaQuery, today: IsoDate, defaultView: AgendaView = "semana") {
  const search = new URLSearchParams();
  if (query.view !== defaultView) search.set("visao", query.view);
  if (query.date !== today) search.set("data", query.date);
  if (query.professionalId) search.set("profissional", query.professionalId);
  if (query.category) search.set("categoria", query.category);
  if (query.status) search.set("status", query.status);
  const text = search.toString();
  return `/conta/${practiceId}${text ? `?${text}` : ""}`;
}

export const APPOINTMENT_TABS = ["resumo", "mensagens", "historico"] as const;
export type AppointmentTab = (typeof APPOINTMENT_TABS)[number];

export function parseAppointmentTab(value: string | string[] | undefined): AppointmentTab {
  const tab = first(value);
  return APPOINTMENT_TABS.includes(tab as AppointmentTab) ? (tab as AppointmentTab) : "resumo";
}

/** What opens over the agenda, in the URL too (D-83, D-85): an appointment, a new block or an existing one. */
export type AgendaPanel =
  | { kind: "appointment"; id: string; tab: AppointmentTab }
  | { kind: "new-block"; date: IsoDate | null; time: string | null; professionalId: string | null }
  | { kind: "block"; id: string };

export function parseAgendaPanel(params: SearchParams): AgendaPanel | null {
  const appointment = first(params.agendamento);
  if (appointment) return { kind: "appointment", id: appointment, tab: parseAppointmentTab(params.aba) };
  const block = first(params.bloqueio);
  if (!block) return null;
  if (block !== "novo") return { kind: "block", id: block };
  const date = first(params.bloqueioData);
  const time = first(params.bloqueioHora);
  return {
    kind: "new-block",
    date: date && isIsoDate(date) ? date : null,
    time: time && isTime(time) ? time : null,
    professionalId: first(params.bloqueioProfissional) ?? null,
  };
}

export function withPanel(href: string, panel: AgendaPanel) {
  const search = new URLSearchParams();
  if (panel.kind === "appointment") {
    search.set("agendamento", panel.id);
    if (panel.tab !== "resumo") search.set("aba", panel.tab);
  } else if (panel.kind === "block") {
    search.set("bloqueio", panel.id);
  } else {
    search.set("bloqueio", "novo");
    if (panel.date) search.set("bloqueioData", panel.date);
    if (panel.time) search.set("bloqueioHora", panel.time);
    if (panel.professionalId) search.set("bloqueioProfissional", panel.professionalId);
  }
  return `${href}${href.includes("?") ? "&" : "?"}${search}`;
}

/** A free slot is offered from the current hour on (D-82). */
export function isFutureSlot(cell: { date: IsoDate; hour: number }, now: { date: IsoDate; hour: number }) {
  return cell.date > now.date || (cell.date === now.date && cell.hour >= now.hour);
}

/** A phone opens the agenda on the day's list, which needs no sideways scrolling (D-82). */
export function isPhoneUserAgent(userAgent: string | null) {
  return userAgent !== null && /Mobi|Android|iPhone/i.test(userAgent);
}
