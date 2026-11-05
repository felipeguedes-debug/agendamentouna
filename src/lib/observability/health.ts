import { AgendaError } from "@/lib/agenda/errors";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { crmAccountOf } from "@/lib/crm/account";
import { addDays, startOfZonedDay, type IsoDate } from "@/lib/dates/zoned";
import { forPractice, prisma, type PracticeScopedClient } from "@/lib/db";
import { deliveryOf, type IndicatorPeriod } from "@/lib/indicators/indicators";
import { syncFailureRate } from "@/lib/indicators/rules";

/**
 * The internal panel of PRD 7 (D-101): is the operation working? WhatsApp's delivery, sync
 * failures and errors, by practice and through its scoped client. Delivery and Google's
 * failures are the same accounts as the indicators (D-74); what is about now, like a queue
 * or an instance's connection, has no period.
 */

const MAX_ERROR_GROUPS = 20;

export type PracticeHealth = Awaited<ReturnType<typeof loadPracticeHealth>>;

function periodRange({ start, endExclusive }: { start: IsoDate; endExclusive: IsoDate }, timeZone: string) {
  return { gte: startOfZonedDay(start, timeZone), lt: startOfZonedDay(endExclusive, timeZone) };
}

async function instancesOf(db: PracticeScopedClient) {
  const professionals = await db.professional.findMany({ where: { active: true }, select: { whatsappInstance: { select: { status: true } } } });
  const connected = professionals.filter((row) => row.whatsappInstance?.status === "CONNECTED").length;
  const withoutInstance = professionals.filter((row) => !row.whatsappInstance).length;
  return { professionals: professionals.length, connected, notConnected: professionals.length - connected - withoutInstance, withoutInstance };
}

async function googleOf(db: PracticeScopedClient, range: { gte: Date; lt: Date }) {
  const [events, waiting, professionals] = await Promise.all([
    db.appointment.findMany({ where: { startsAt: range, OR: [{ googleSyncedAt: { not: null } }, { googleSyncError: { not: null } }] }, select: { googleSyncedAt: true, googleSyncError: true } }),
    db.appointment.count({ where: { googleSyncRequestedAt: { not: null } } }),
    db.professional.findMany({ where: { active: true, googleConnectionId: { not: null } }, select: { googleConnectionId: true } }),
  ]);
  // Base client: a Google connection belongs to no practice, and only its status is read.
  const revokedLinks = await prisma.googleConnection.count({ where: { id: { in: professionals.map((row) => row.googleConnectionId!) }, status: { not: "ACTIVE" } } });
  return { failures: syncFailureRate(events.map((row) => ({ syncedAt: row.googleSyncedAt, error: row.googleSyncError }))), waiting, revokedLinks };
}

async function crmOf(db: PracticeScopedClient) {
  const [account, patientsWaiting, appointmentsWaiting, patientsFailed, appointmentsFailed] = await Promise.all([
    crmAccountOf(db),
    db.patient.count({ where: { crmSyncRequestedAt: { not: null } } }),
    db.appointment.count({ where: { crmSyncRequestedAt: { not: null } } }),
    db.patient.count({ where: { crmSyncError: { not: null } } }),
    db.appointment.count({ where: { crmSyncError: { not: null } } }),
  ]);
  const status = !account ? ("none" as const) : account.status === "ACTIVE" ? ("active" as const) : ("revoked" as const);
  return { status, waiting: patientsWaiting + appointmentsWaiting, failed: patientsFailed + appointmentsFailed };
}

async function dispatchFailuresOf(db: PracticeScopedClient, range: { gte: Date; lt: Date }) {
  const rows = await db.dispatch.groupBy({ by: ["statusReason"], where: { status: "FAILED", sentAt: null, scheduledFor: range }, _count: { _all: true } });
  return rows.map((row) => ({ reason: row.statusReason ?? "unknown", count: row._count._all })).sort((a, b) => b.count - a.count);
}

async function serverErrorsOf(db: PracticeScopedClient, range: { gte: Date; lt: Date }) {
  const rows = await db.serverError.groupBy({ by: ["source", "route", "errorName"], where: { occurredAt: range }, _count: { _all: true }, _max: { occurredAt: true } });
  const groups = rows
    .map((row) => ({ source: row.source, route: row.route, errorName: row.errorName, count: row._count._all, lastAt: row._max.occurredAt }))
    .sort((a, b) => b.count - a.count);
  return { total: groups.reduce((sum, group) => sum + group.count, 0), groups: groups.slice(0, MAX_ERROR_GROUPS) };
}

export async function loadPracticeHealth(db: PracticeScopedClient, period: IndicatorPeriod) {
  const timeZone = await agendaTimeZone(db);
  const range = periodRange(period, timeZone);
  const [delivery, dispatchFailures, instances, google, crm, serverErrors] = await Promise.all([deliveryOf(db, period, timeZone), dispatchFailuresOf(db, range), instancesOf(db), googleOf(db, range), crmOf(db), serverErrorsOf(db, range)]);
  return { delivery, dispatchFailures, instances, google, crm, serverErrors };
}

/** The same for the admin, by practice (D-75's rule: only their organization, each by its own client). */
export async function loadOrganizationHealth(context: PracticeContext, period: IndicatorPeriod) {
  if (!can(context.access.role, "reports:consolidated")) throw new AgendaError("not_allowed", "Cannot see the organization's panel");
  // Base client: listing the organization's practices crosses practices by definition.
  const practices = await prisma.practice.findMany({ where: { organizationId: context.access.organizationId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const rows = await Promise.all(practices.map(async (practice) => ({ practiceId: practice.id, name: practice.name, health: await loadPracticeHealth(forPractice(practice.id), period) })));
  return { practices: rows };
}

/** The last days through today, in UTC: for the operator's command, which has no practice's day. */
export function lastDaysPeriod(days: number, now = new Date()): IndicatorPeriod {
  const today = now.toISOString().slice(0, 10) as IsoDate;
  return { start: addDays(today, 1 - days), endExclusive: addDays(today, 1) };
}
