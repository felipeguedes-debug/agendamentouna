import { AgendaError } from "@/lib/agenda/errors";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { OCCUPYING_STATUSES } from "@/lib/appointments/status";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { forPractice, prisma, type PracticeScopedClient } from "@/lib/db";
import { addDays, startOfZonedDay, todayIn, toZoned, type IsoDate } from "@/lib/dates/zoned";
import { listProfessionalsGoogle } from "@/lib/google/profile";
import {
  adoptionRate,
  ADOPTION_MIN_DAYS,
  confirmationRate,
  confirmationWork,
  deliveryRate,
  googleCoverage,
  lastCompleteWeek,
  noShowByType,
  noShowRate,
  occupancy,
  ratio,
  syncFailureRate,
  usageDays,
  valueRealization,
} from "./rules";

/**
 * Reads what the panel of PRD 8 shows, one practice at a time through its scoped client
 * (D-74). The arithmetic is in ./rules.ts. Each appointment and message sits on the day
 * of its own location (D-03), so the query goes one day past the period on each side
 * and the local date decides; the day of a block and of an audit event comes from the
 * practice's agenda time zone (D-41).
 */

export type IndicatorPeriod = { start: IsoDate; endExclusive: IsoDate };

function queryRange(period: IndicatorPeriod, timeZone: string) {
  return { gte: startOfZonedDay(addDays(period.start, -1), timeZone), lt: startOfZonedDay(addDays(period.endExclusive, 1), timeZone) };
}

function inPeriod(instant: Date, timeZone: string, { start, endExclusive }: IndicatorPeriod) {
  const { date } = toZoned(instant, timeZone);
  return start <= date && date < endExclusive;
}

const isoDate = (date: Date): IsoDate => date.toISOString().slice(0, 10);

async function appointmentsOf(db: PracticeScopedClient, period: IndicatorPeriod, timeZone: string, now: Date) {
  const rows = await db.appointment.findMany({
    where: { startsAt: queryRange(period, timeZone) },
    select: {
      status: true,
      startsAt: true,
      endsAt: true,
      priceCents: true,
      professionalId: true,
      appointmentTypeId: true,
      googleSyncedAt: true,
      googleSyncError: true,
      appointmentType: { select: { name: true } },
      location: { select: { timeZone: true } },
      statusChanges: { where: { toStatus: "CONFIRMED", source: "CADENCE_REPLY" }, select: { id: true }, take: 1 },
      dispatches: { where: { cadenceStep: { is: { action: "REQUEST_CONFIRMATION" } } }, select: { status: true, sentAt: true } },
    },
  });
  return rows
    .filter((row) => inPeriod(row.startsAt, row.location.timeZone, period))
    .map((row) => ({
      ...row,
      typeId: row.appointmentTypeId,
      typeName: row.appointmentType.name,
      // D-13: Sem baixa only from the end of the appointment's own local day.
      dayOver: toZoned(row.startsAt, row.location.timeZone).date < todayIn(row.location.timeZone, now),
    }));
}

async function occupancyOf(db: PracticeScopedClient, period: IndicatorPeriod, timeZone: string, appointments: Awaited<ReturnType<typeof appointmentsOf>>) {
  const professionals = await db.professional.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      workingHours: { select: { weekday: true, startTime: true, endTime: true, locationId: true, location: { select: { timeZone: true } } } },
      exceptions: { select: { startsOn: true, endsOn: true, locationId: true } },
      timeBlocks: { where: { deletedAt: null, startsAt: { lt: queryRange(period, timeZone).lt }, endsAt: { gt: queryRange(period, timeZone).gte } }, select: { startsAt: true, endsAt: true } },
    },
  });
  const occupying = appointments.filter((row) => (OCCUPYING_STATUSES as readonly string[]).includes(row.status));
  const byProfessional = professionals.map((professional) => ({
    id: professional.id,
    name: professional.name,
    ...occupancy({
      period,
      workingHours: professional.workingHours.map((hours) => ({ ...hours, timeZone: hours.location.timeZone })),
      exceptions: professional.exceptions.map((exception) => ({ startsOn: isoDate(exception.startsOn), endsOn: isoDate(exception.endsOn), locationId: exception.locationId })),
      blocks: professional.timeBlocks,
      appointments: occupying.filter((row) => row.professionalId === professional.id),
    }),
  }));
  const occupiedMinutes = byProfessional.reduce((total, row) => total + row.occupiedMinutes, 0);
  const availableMinutes = byProfessional.reduce((total, row) => total + row.availableMinutes, 0);
  return { byProfessional, total: { occupiedMinutes, availableMinutes, rate: ratio(occupiedMinutes, availableMinutes) } };
}

export async function deliveryOf(db: PracticeScopedClient, period: IndicatorPeriod, timeZone: string) {
  const range = queryRange(period, timeZone);
  const rows = await db.dispatch.findMany({
    where: { OR: [{ sentAt: range }, { sentAt: null, status: "FAILED", scheduledFor: range }] },
    select: { status: true, sentAt: true, scheduledFor: true, appointment: { select: { location: { select: { timeZone: true } } } } },
  });
  return deliveryRate(
    rows
      .filter((row) => inPeriod(row.sentAt ?? row.scheduledFor, row.appointment.location.timeZone, period))
      .map((row) => ({ status: row.status, sent: row.sentAt !== null })),
  );
}

async function confirmationWorkOf(db: PracticeScopedClient, period: IndicatorPeriod, timeZone: string) {
  const [work, manualContacts] = await Promise.all([
    db.confirmationWorkTime.findMany({ select: { date: true, minutes: true } }),
    db.appointmentFlag.count({
      where: { type: "MANUAL_CONTACT", createdAt: { gte: startOfZonedDay(period.start, timeZone), lt: startOfZonedDay(period.endExclusive, timeZone) } },
    }),
  ]);
  const all = work.map((row) => ({ date: isoDate(row.date), minutes: row.minutes }));
  return {
    ...confirmationWork({ inPeriod: all.filter((row) => period.start <= row.date && row.date < period.endExclusive), all }),
    manualContacts,
  };
}

/** Days of use in the last whole week; `null`: nobody ever acted in this practice (D-75). */
async function usageOf(db: PracticeScopedClient, timeZone: string, now: Date) {
  const week = lastCompleteWeek(todayIn(timeZone, now));
  const ever = await db.auditEvent.findFirst({ where: { actorType: "USER" }, select: { id: true } });
  if (!ever) return { week, days: null };
  const events = await db.auditEvent.findMany({
    where: { actorType: "USER", occurredAt: { gte: startOfZonedDay(week.start, timeZone), lt: startOfZonedDay(week.endExclusive, timeZone) } },
    select: { occurredAt: true },
  });
  return { week, days: usageDays(events.map((event) => event.occurredAt), week, timeZone) };
}

export async function loadIndicators(context: PracticeContext, period: IndicatorPeriod, now = new Date()) {
  if (!can(context.access.role, "reports:practice")) throw new AgendaError("not_allowed", "Cannot see the practice's indicators");
  const { db } = context;
  const timeZone = await agendaTimeZone(db);
  const appointments = await appointmentsOf(db, period, timeZone, now);
  const [occupancyResult, delivery, work, usage, professionals] = await Promise.all([
    occupancyOf(db, period, timeZone, appointments),
    deliveryOf(db, period, timeZone),
    confirmationWorkOf(db, period, timeZone),
    usageOf(db, timeZone, now),
    listProfessionalsGoogle(context),
  ]);
  return {
    timeZone,
    noShow: noShowRate(appointments),
    noShowByType: noShowByType(appointments),
    realization: valueRealization(appointments),
    autoConfirmation: confirmationRate(
      appointments.map((row) => ({
        status: row.status,
        confirmedByReply: row.statusChanges.length > 0,
        requests: row.dispatches.map((dispatch) => ({ status: dispatch.status, sent: dispatch.sentAt !== null })),
      })),
    ),
    confirmationWork: work,
    googleCoverage: googleCoverage(professionals.map((professional) => professional.status)),
    syncFailures: syncFailureRate(appointments.map((row) => ({ syncedAt: row.googleSyncedAt, error: row.googleSyncError }))),
    delivery,
    occupancy: occupancyResult,
    adoption: { ...usage, minDays: ADOPTION_MIN_DAYS },
  };
}

export type PracticeIndicators = Awaited<ReturnType<typeof loadIndicators>>;

/**
 * The organization admin's consolidated view (PRD 3, "Consolidado por conta"; D-75):
 * every practice of the admin's organization and no other, each read through its own
 * scoped client. A practice manager never gets here, whatever other practice they reach.
 */
export async function loadOrganizationIndicators(context: PracticeContext, period: IndicatorPeriod, now = new Date()) {
  if (!can(context.access.role, "reports:consolidated")) throw new AgendaError("not_allowed", "Cannot see the organization's indicators");
  // Base client: listing the organization's practices crosses practices by definition.
  const practices = await prisma.practice.findMany({
    where: { organizationId: context.access.organizationId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const rows = await Promise.all(
    practices.map(async (practice) => {
      const db = forPractice(practice.id);
      const timeZone = await agendaTimeZone(db);
      const [appointments, usage] = await Promise.all([appointmentsOf(db, period, timeZone, now), usageOf(db, timeZone, now)]);
      return { practiceId: practice.id, name: practice.name, days: usage.days, week: usage.week, noShow: noShowRate(appointments) };
    }),
  );
  return { practices: rows, adoption: adoptionRate(rows.map((row) => row.days)), minDays: ADOPTION_MIN_DAYS };
}

const MIN_BEAT_INTERVAL_MS = 50_000;

/**
 * One minute on the "Sem confirmação" list, from a heartbeat of the screen (D-75). A row
 * per user and local day, so a second tab of the same person adds nothing.
 */
export async function recordConfirmationWorkMinute(context: PracticeContext, now = new Date()) {
  if (!can(context.access.role, "agenda:view")) throw new AgendaError("not_allowed", "Cannot work the follow-up list");
  const { db, user, access } = context;
  const date = new Date(`${todayIn(await agendaTimeZone(db), now)}T00:00:00Z`);
  const key = { practiceId: access.practiceId, userId: user.id, date };
  const { count } = await db.confirmationWorkTime.updateMany({
    where: { ...key, lastBeatAt: { lt: new Date(now.getTime() - MIN_BEAT_INTERVAL_MS) } },
    data: { minutes: { increment: 1 }, lastBeatAt: now },
  });
  if (count > 0) return;
  // No row to update: the day's first minute, unless a beat just counted (or one is racing).
  await db.confirmationWorkTime.createMany({ data: [{ ...key, minutes: 1, lastBeatAt: now }], skipDuplicates: true });
}
