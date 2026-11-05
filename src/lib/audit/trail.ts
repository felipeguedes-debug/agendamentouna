import type { AuditActorType } from "@/generated/prisma/enums";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { AgendaError } from "@/lib/agenda/errors";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { addDays, formatDateBr, startOfZonedDay, todayIn, toZoned } from "@/lib/dates/zoned";
import { AUDIT_AREA_PREFIXES, auditActionLabel, auditFieldsLabel, type AuditArea, type AuditPeriod } from "./labels";

/**
 * The audit trail on the screen (PRD 3, req. 4; D-87), for the manager and the admin.
 * The events keep ids and field names (D-28), so what the row says about the entity is
 * read now, from the entity itself: a patient who asked for erasure shows as "Paciente
 * excluído", and nothing here ever shows the value of a field.
 */

const PAGE_SIZE = 25;

export type AuditFilters = { period: AuditPeriod; who: string | null; area: AuditArea | null; page: number };

const ACTOR_KINDS: Record<string, AuditActorType> = { paciente: "PATIENT", google: "GOOGLE", crm: "CRM", sistema: "SYSTEM" };

const ACTOR_LABELS: Record<Exclude<AuditActorType, "USER">, string> = { PATIENT: "Paciente", GOOGLE: "Google Agenda", CRM: "SynkronosCRM", SYSTEM: "Sistema" };

const ACTOR_DETAILS: Record<Exclude<AuditActorType, "USER">, string> = { PATIENT: "WhatsApp", GOOGLE: "Sincronização", CRM: "Etiqueta de comando", SYSTEM: "Automático" };

const ENTITY_FALLBACK: Record<string, string> = {
  Practice: "Conta",
  Professional: "Profissional",
  Invitation: "Convite",
  Membership: "Usuário",
  TimeBlock: "Bloqueio",
  WorkingHours: "Horário de atendimento",
  ScheduleException: "Exceção de horário",
  CrmConnection: "SynkronosCRM",
  ContactConsent: "Consentimento",
};

function periodStart(period: AuditPeriod, timeZone: string, now: Date) {
  const today = todayIn(timeZone, now);
  if (period === "hoje") return startOfZonedDay(today, timeZone);
  if (period === "7d") return startOfZonedDay(addDays(today, -6), timeZone);
  if (period === "30d") return startOfZonedDay(addDays(today, -29), timeZone);
  return null;
}

/** Names of the entities in the page, read by the practice's client. */
async function entityNames(context: PracticeContext, rows: { entityType: string; entityId: string | null }[]) {
  const { db } = context;
  const idsOf = (type: string) => rows.filter((row) => row.entityType === type && row.entityId).map((row) => row.entityId!);
  const [appointments, patients, types, cadences, locations, professionals] = await Promise.all([
    db.appointment.findMany({ where: { id: { in: idsOf("Appointment") } }, select: { id: true, startsAt: true, patient: { select: { name: true } }, location: { select: { timeZone: true } } } }),
    db.patient.findMany({ where: { id: { in: idsOf("Patient") } }, select: { id: true, name: true } }),
    db.appointmentType.findMany({ where: { id: { in: idsOf("AppointmentType") } }, select: { id: true, name: true } }),
    db.cadence.findMany({ where: { id: { in: idsOf("Cadence") } }, select: { id: true, name: true } }),
    db.location.findMany({ where: { id: { in: idsOf("Location") } }, select: { id: true, name: true } }),
    db.professional.findMany({ where: { id: { in: idsOf("Professional") } }, select: { id: true, name: true } }),
  ]);
  const names = new Map<string, string>();
  for (const row of appointments) {
    const start = toZoned(row.startsAt, row.location.timeZone);
    names.set(row.id, `${row.patient.name}, ${formatDateBr(start.date).slice(0, 5)} ${start.time}`);
  }
  for (const row of [...patients, ...types, ...cadences, ...locations, ...professionals]) names.set(row.id, row.name);
  return names;
}

/** Where the row's link goes, when the entity has a screen. */
function entityHref(practiceId: string, entityType: string, entityId: string | null) {
  const base = `/conta/${practiceId}`;
  if (!entityId) return null;
  if (entityType === "Appointment") return `${base}/agendamentos/${entityId}`;
  if (entityType === "Patient") return `${base}/pacientes/${entityId}`;
  if (entityType === "AppointmentType") return `${base}/tipos`;
  if (entityType === "Cadence") return `${base}/regua`;
  if (entityType === "Location") return `${base}/unidades`;
  if (entityType === "WorkingHours" || entityType === "ScheduleException") return `${base}/unidades/horarios`;
  if (entityType === "Professional") return `${base}/profissionais/${entityId}`;
  return null;
}

export async function listAuditEvents(context: PracticeContext, filters: AuditFilters, now = new Date()) {
  const { db, access } = context;
  if (!can(access.role, "audit:view")) throw new AgendaError("not_allowed", "Cannot see the audit trail");
  const timeZone = await agendaTimeZone(db);
  const from = periodStart(filters.period, timeZone, now);
  const actorKind = filters.who ? ACTOR_KINDS[filters.who] : undefined;
  const where = {
    ...(from ? { occurredAt: { gte: from } } : {}),
    ...(actorKind ? { actorType: actorKind } : filters.who ? { actorUserId: filters.who } : {}),
    ...(filters.area ? { OR: AUDIT_AREA_PREFIXES[filters.area].map((prefix) => ({ action: { startsWith: prefix } })) } : {}),
  };
  const total = await db.auditEvent.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(filters.page, 1), pages);
  const rows = await db.auditEvent.findMany({ where, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });

  const userIds = [...new Set(rows.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])))];
  // Members of the practice, revoked ones included; an organization admin has no membership.
  const [users, names] = await Promise.all([db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }), entityNames(context, rows)]);
  const userNames = new Map(users.map((user) => [user.id, user.name]));
  const today = todayIn(timeZone, now);

  return {
    total,
    page,
    pages,
    items: rows.map((row) => {
      const at = toZoned(row.occurredAt, timeZone);
      const day = at.date === today ? "Hoje" : at.date === addDays(today, -1) ? "Ontem" : formatDateBr(at.date);
      const kind = row.actorType === "USER" ? null : row.actorType;
      return {
        id: row.id,
        when: `${day}, ${at.time}`,
        who: kind ? ACTOR_LABELS[kind] : (row.actorUserId && userNames.get(row.actorUserId)) || "Administrador",
        detail: kind ? ACTOR_DETAILS[kind] : null,
        what: auditActionLabel(row.action),
        where: (row.entityId && names.get(row.entityId)) || ENTITY_FALLBACK[row.entityType] || row.entityType,
        href: entityHref(access.practiceId, row.entityType, row.entityId),
        fields: auditFieldsLabel(row.changedFields),
      };
    }),
  };
}

/** Who appears in the filter: the people with events here, plus the kinds that are not people. */
export async function auditPeople(context: PracticeContext) {
  const { db, access } = context;
  if (!can(access.role, "audit:view")) throw new AgendaError("not_allowed", "Cannot see the audit trail");
  const actors = await db.auditEvent.findMany({ where: { actorUserId: { not: null } }, distinct: ["actorUserId"], select: { actorUserId: true } });
  const users = await db.user.findMany({ where: { id: { in: actors.flatMap((row) => (row.actorUserId ? [row.actorUserId] : [])) } }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return [
    ...users.map((user) => ({ value: user.id, label: user.name })),
    { value: "paciente", label: "Paciente" },
    { value: "google", label: "Google Agenda" },
    { value: "crm", label: "SynkronosCRM" },
    { value: "sistema", label: "Sistema" },
  ];
}
