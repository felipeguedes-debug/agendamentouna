import type { Prisma } from "@/generated/prisma/client";
import type { AppointmentCategory, AppointmentStatus } from "@/generated/prisma/enums";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid, type PracticeScopedClient } from "@/lib/db";
import { ownProfessionalIds } from "@/lib/appointments/appointments";
import { OPEN_STATUSES, PREDICTED_STATUSES } from "@/lib/appointments/status";
import {
  addDays,
  addMonths,
  DEFAULT_TIME_ZONE,
  eachDay,
  firstOfMonth,
  mondayOf,
  startOfZonedDay,
  todayIn,
  toZoned,
  weekdayOf,
  type IsoDate,
} from "@/lib/dates/zoned";
import type { AgendaFilters, AgendaQuery, AgendaView, StatusFilter } from "./params";

/**
 * The agenda views of PRD 4: day, week, month, multi-professional and the day list
 * with "Sem baixa", plus the value panel (D-13). Each appointment sits on the day
 * and hour of its own location's wall clock (D-03); the period and the time blocks
 * use the agenda's time zone, the one of the practice's first location (D-41).
 * A professional sees only their own agenda, whatever the filters say.
 */

type ItemBase = { id: string; professionalId: string; professionalName: string; date: IsoDate; time: string; endTime: string; hour: number };

export type AppointmentItem = ItemBase & {
  kind: "appointment";
  startsAt: Date;
  endsAt: Date;
  patientName: string;
  typeName: string;
  category: AppointmentCategory;
  color: string;
  status: AppointmentStatus;
  priceCents: number;
  noConfirmation: boolean;
  /** The patient's answers that wait for the office (D-08, D-05). */
  rescheduleRequested: boolean;
  repliedWithoutConfirming: boolean;
  /** A change made in Google waits for accept or revert (PRD 5, rule 3). */
  googlePending: boolean;
  locationName: string;
};

export type BlockItem = ItemBase & { kind: "block"; allDay: boolean; reason: string | null; source: "MANUAL" | "GOOGLE" };

export type AgendaItem = AppointmentItem | BlockItem;

export type AgendaTotals = { scheduled: number; withoutConfirmation: number; predictedCents: number; realizedCents: number };

const DAY_MS = 86_400_000;
const MAX_WITHOUT_CLOSING = 500;

export function periodOf(view: AgendaView, date: IsoDate): { start: IsoDate; endExclusive: IsoDate } {
  if (view === "semana") {
    const monday = mondayOf(date);
    return { start: monday, endExclusive: addDays(monday, 7) };
  }
  if (view === "mes") return { start: firstOfMonth(date), endExclusive: addMonths(date, 1) };
  return { start: date, endExclusive: addDays(date, 1) };
}

/** The time zone of the practice's first active location (D-41). */
export async function agendaTimeZone(db: PracticeScopedClient) {
  const location = await db.location.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { timeZone: true } });
  return location?.timeZone ?? DEFAULT_TIME_ZONE;
}

/** Professionals the user may see, and the ids a filter narrows them to (null: no narrowing). */
async function visibleProfessionals(context: PracticeContext, requested: string | null) {
  const ownOnly = !can(context.access.role, "agenda:view");
  const own = ownOnly ? await ownProfessionalIds(context) : [];
  const professionals = await context.db.professional.findMany({
    where: ownOnly ? { id: { in: own } } : {},
    orderBy: { name: "asc" },
    select: { id: true, name: true, active: true },
  });
  const requestedVisible = requested && isUuid(requested) && professionals.some((professional) => professional.id === requested);
  const professionalIds = requestedVisible ? [requested] : ownOnly ? own : null;
  return { ownOnly, professionals, professionalIds };
}

function totalsOf(items: AgendaItem[]): AgendaTotals {
  const totals: AgendaTotals = { scheduled: 0, withoutConfirmation: 0, predictedCents: 0, realizedCents: 0 };
  for (const item of items) {
    if (item.kind !== "appointment") continue;
    if ((PREDICTED_STATUSES as readonly AppointmentStatus[]).includes(item.status)) {
      totals.scheduled += 1;
      totals.predictedCents += item.priceCents;
    }
    if (item.status === "COMPLETED") totals.realizedCents += item.priceCents;
    if (item.noConfirmation) totals.withoutConfirmation += 1;
  }
  return totals;
}

const APPOINTMENT_INCLUDE = {
  patient: { select: { name: true } },
  professional: { select: { name: true } },
  appointmentType: { select: { name: true, category: true, color: true } },
  location: { select: { name: true, timeZone: true } },
  flags: { where: { type: { in: ["NO_CONFIRMATION", "RESCHEDULE_REQUESTED", "REPLIED_WITHOUT_CONFIRMING"] }, resolvedAt: null }, select: { type: true } },
  pendingGoogleChanges: { where: { resolvedAt: null }, select: { id: true } },
} satisfies Prisma.AppointmentInclude;

type AppointmentRow = Prisma.AppointmentGetPayload<{ include: typeof APPOINTMENT_INCLUDE }>;

function appointmentWhere(filters: { professionalIds: string[] | null; category: AppointmentCategory | null; status: StatusFilter | null }) {
  const where: Prisma.AppointmentWhereInput = {};
  if (filters.professionalIds) where.professionalId = { in: filters.professionalIds };
  if (filters.category) where.appointmentType = { category: filters.category };
  if (filters.status === "NO_CONFIRMATION") {
    where.status = "SCHEDULED";
    where.flags = { some: { type: "NO_CONFIRMATION", resolvedAt: null } };
  } else if (filters.status) {
    where.status = filters.status;
  }
  return where;
}

function toAppointmentItem(row: AppointmentRow): AppointmentItem {
  const start = toZoned(row.startsAt, row.location.timeZone);
  return {
    kind: "appointment",
    id: row.id,
    professionalId: row.professionalId,
    professionalName: row.professional.name,
    date: start.date,
    time: start.time,
    endTime: toZoned(row.endsAt, row.location.timeZone).time,
    hour: start.hour,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    patientName: row.patient.name,
    typeName: row.appointmentType.name,
    category: row.appointmentType.category,
    color: row.appointmentType.color,
    status: row.status,
    priceCents: row.priceCents,
    noConfirmation: row.status === "SCHEDULED" && row.flags.some((flag) => flag.type === "NO_CONFIRMATION"),
    rescheduleRequested: row.flags.some((flag) => flag.type === "RESCHEDULE_REQUESTED"),
    repliedWithoutConfirming: row.flags.some((flag) => flag.type === "REPLIED_WITHOUT_CONFIRMING"),
    googlePending: row.pendingGoogleChanges.length > 0,
    locationName: row.location.name,
  };
}

/** Appointments and time blocks on the days of [start, endExclusive), filtered. */
async function collectItems(
  db: PracticeScopedClient,
  range: { start: IsoDate; endExclusive: IsoDate; timeZone: string },
  filters: { professionalIds: string[] | null; category: AppointmentCategory | null; status: StatusFilter | null },
): Promise<AgendaItem[]> {
  const from = startOfZonedDay(range.start, range.timeZone);
  const to = startOfZonedDay(range.endExclusive, range.timeZone);
  const wantsAppointments = filters.category !== "BLOCK";
  const wantsBlocks = !filters.status && (!filters.category || filters.category === "BLOCK");

  const [appointments, blocks] = await Promise.all([
    wantsAppointments
      ? db.appointment.findMany({
          // A day of margin on each side for locations in other time zones.
          where: { ...appointmentWhere(filters), startsAt: { gte: new Date(from.getTime() - DAY_MS), lt: new Date(to.getTime() + DAY_MS) } },
          include: APPOINTMENT_INCLUDE,
          orderBy: { startsAt: "asc" },
        })
      : [],
    wantsBlocks
      ? db.timeBlock.findMany({
          where: {
            ...(filters.professionalIds ? { professionalId: { in: filters.professionalIds } } : {}),
            deletedAt: null,
            startsAt: { lt: to },
            endsAt: { gt: from },
          },
          include: { professional: { select: { name: true } } },
          orderBy: { startsAt: "asc" },
        })
      : [],
  ]);

  const items: AgendaItem[] = appointments
    .map(toAppointmentItem)
    .filter((item) => item.date >= range.start && item.date < range.endExclusive);

  // A block shows on every day it touches, cut to that day.
  for (const day of eachDay(range.start, range.endExclusive)) {
    const dayStart = startOfZonedDay(day, range.timeZone);
    const dayEnd = startOfZonedDay(addDays(day, 1), range.timeZone);
    for (const block of blocks) {
      if (block.startsAt >= dayEnd || block.endsAt <= dayStart) continue;
      const start = block.startsAt > dayStart ? block.startsAt : dayStart;
      const end = block.endsAt < dayEnd ? block.endsAt : dayEnd;
      const zonedStart = toZoned(start, range.timeZone);
      items.push({
        kind: "block",
        id: block.id,
        professionalId: block.professionalId,
        professionalName: block.professional.name,
        date: day,
        time: zonedStart.time,
        endTime: end.getTime() === dayEnd.getTime() ? "24:00" : toZoned(end, range.timeZone).time,
        hour: zonedStart.hour,
        allDay: block.allDay || (start.getTime() === dayStart.getTime() && end.getTime() === dayEnd.getTime()),
        reason: block.reason,
        source: block.source,
      });
    }
  }
  return items.sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
}

export async function loadAgenda(context: PracticeContext, query: AgendaQuery, now = new Date()) {
  const timeZone = await agendaTimeZone(context.db);
  const { ownOnly, professionals, professionalIds } = await visibleProfessionals(context, query.professionalId);
  const period = periodOf(query.view, query.date);
  const items =
    ownOnly && professionalIds?.length === 0
      ? []
      : await collectItems(context.db, { ...period, timeZone }, { professionalIds, category: query.category, status: query.status });

  return {
    timeZone,
    today: todayIn(timeZone, now),
    period,
    days: eachDay(period.start, period.endExclusive),
    ownOnly,
    professionals: professionals.filter((professional) => professional.active).map(({ id, name }) => ({ id, name })),
    selectedProfessionalId: professionalIds?.length === 1 ? professionalIds[0] : null,
    items,
    totals: totalsOf(items),
  };
}

/**
 * "Sem baixa" (D-13): past appointments still Agendado, Confirmado, Chegou or Em
 * atendimento, from the end of their local day until someone closes them.
 */
export async function listWithoutClosing(context: PracticeContext, filters: AgendaFilters, now = new Date()): Promise<AppointmentItem[]> {
  const { db } = context;
  const timeZone = await agendaTimeZone(db);
  const { ownOnly, professionalIds } = await visibleProfessionals(context, filters.professionalId);
  if (ownOnly && professionalIds?.length === 0) return [];
  const status = filters.status && (filters.status === "NO_CONFIRMATION" || (OPEN_STATUSES as readonly string[]).includes(filters.status)) ? filters.status : null;
  if (filters.status && !status) return [];

  // Through the end of today in the agenda's zone, then each location's own calendar decides.
  const cutoff = startOfZonedDay(addDays(todayIn(timeZone, now), 1), timeZone);
  const rows = await db.appointment.findMany({
    where: {
      ...appointmentWhere({ professionalIds, category: filters.category === "BLOCK" ? null : filters.category, status }),
      ...(status ? {} : { status: { in: [...OPEN_STATUSES] } }),
      startsAt: { lt: cutoff },
    },
    include: APPOINTMENT_INCLUDE,
    orderBy: { startsAt: "asc" },
    take: MAX_WITHOUT_CLOSING,
  });
  if (filters.category === "BLOCK") return [];
  return rows.filter((row) => toZoned(row.startsAt, row.location.timeZone).date < todayIn(row.location.timeZone, now)).map(toAppointmentItem);
}

/**
 * The professional's day for the booking form: appointments and blocks, the
 * working hours of that weekday and any day off. Informative only (D-43).
 */
export async function loadDayPreview(context: PracticeContext, input: { professionalId: string; date: IsoDate }) {
  const { db } = context;
  const { professionalIds } = await visibleProfessionals(context, input.professionalId);
  if (professionalIds?.length !== 1) return null;
  const timeZone = await agendaTimeZone(db);
  const professionalId = professionalIds[0];
  const [items, workingHours, exceptions] = await Promise.all([
    collectItems(db, { start: input.date, endExclusive: addDays(input.date, 1), timeZone }, { professionalIds, category: null, status: null }),
    db.workingHours.findMany({
      where: { professionalId, weekday: weekdayOf(input.date) },
      orderBy: { startTime: "asc" },
      select: { startTime: true, endTime: true, location: { select: { name: true } } },
    }),
    db.scheduleException.findMany({
      where: { professionalId, startsOn: { lte: new Date(input.date) }, endsOn: { gte: new Date(input.date) } },
      select: { reason: true, location: { select: { name: true } } },
    }),
  ]);
  return {
    items,
    workingHours: workingHours.map((row) => ({ startTime: row.startTime, endTime: row.endTime, locationName: row.location.name })),
    exceptions: exceptions.map((row) => ({ reason: row.reason, locationName: row.location?.name ?? null })),
  };
}
