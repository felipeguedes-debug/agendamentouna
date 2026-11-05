import type { AppointmentStatus, AuditActorType, LeadSource, StatusChangeSource } from "@/generated/prisma/enums";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid, type PracticeScopedClient, type PracticeTransaction } from "@/lib/db";
import { AgendaError } from "@/lib/agenda/errors";
import { isValidDuration, isValidPrice } from "@/lib/appointment-types/appointment-types";
import { applyStatusChangeToCadence, planAppointmentCadence } from "@/lib/cadence/plan";
import { markForCrmSync, requestCrmSync } from "@/lib/crm/queue";
import { markForConfirmationPush, requestConfirmationPush } from "@/lib/push/queue";
import { isCrmSyncedStatus } from "@/lib/crm/rules";
import { markForGoogleSync, requestGoogleSync, supersedeGoogleChanges } from "@/lib/google/queue";
import { formatTime, isIsoDate, isTime, zonedToUtc } from "@/lib/dates/zoned";
import { STATUS_SOURCE_LABELS } from "@/lib/domain/labels";
import { formatPhone } from "@/lib/patients/phone";
import { DEFAULT_INSURANCE } from "@/lib/patients/patients";
import { checkTransition, IMPORTABLE_STATUSES, OCCUPYING_STATUSES, type StatusActor } from "./status";

/**
 * Booking, status changes and rescheduling (PRD 4). Every status change goes
 * through here: it checks the section 4 table, writes the history with author and
 * time, and an audit event with ids and field names only (D-28).
 *
 * - Value and duration are copied from the type when booking (D-12).
 * - A booking over another one or over a time block of the same professional is
 *   refused; the manager may overbook (rule 3, D-43). The check and the insert run
 *   in a serializable transaction, so two people cannot take the same slot at once.
 * - Rescheduling creates a new appointment linked to the original, which becomes
 *   Reagendado (D-11).
 * - The spreadsheet import books with the same checks, the cadence off and IMPORT
 *   as the source, then sets the sheet's status through changeAppointmentStatus (D-48).
 * - The WhatsApp cadence (Block 5) is planned in the booking's transaction, and every
 *   status change applies itself to the cadence in its own transaction (D-06). A
 *   patient's reply changes the status through changeAppointmentStatus with the
 *   cadence as the actor and CADENCE_REPLY as the source (D-08).
 * - Google (Block 6): the same transactions mark the appointment for export to the
 *   professional's secondary calendar, and after the commit Inngest is asked to
 *   export it (D-62). A status change closes the appointment's pending Google
 *   changes; accepting one reschedules or cancels with GOOGLE as the source and the
 *   person who resolved it as the author (D-63).
 * - SynkronosCRM (Block 7): the same transactions mark the appointment for export to
 *   the CRM, and after the commit Inngest is asked to export it, so a CRM that is down
 *   never stops a booking (D-68). A secretary's confirmation made there changes the
 *   status with the CRM as the actor and CRM as the source (D-66).
 */

export const LEAD_SOURCES = ["INSTAGRAM", "REFERRAL", "WEBSITE", "OTHER"] as const satisfies readonly LeadSource[];
const MAX_NOTE = 1000;
const MAX_REASON = 500;
const MAX_INSURANCE = 80;
const SERIALIZABLE_ATTEMPTS = 3;
const ORG_ADMIN_AUTHOR = "Admin da organização";

type Tx = PracticeTransaction;

/** The WhatsApp cadence acting on the patient's reply (D-08): no user, CADENCE_REPLY as the source. */
export type CadenceActor = { kind: "cadence"; practiceId: string; db: PracticeScopedClient };

/** The secretary's command tag in SynkronosCRM (D-66): no user of the agenda, CRM as the source. */
export type CrmActor = { kind: "crm"; practiceId: string; db: PracticeScopedClient };

export type CreateAppointmentInput = {
  patientId: string;
  professionalId: string;
  locationId: string;
  appointmentTypeId: string;
  /** Wall-clock date and time in the location's time zone. */
  date: string;
  time: string;
  durationMinutes?: number;
  priceCents?: number;
  leadSource?: LeadSource | null;
  insurance?: string | null;
  internalNote?: string | null;
  allowConflict?: boolean;
};

export type RescheduleInput = {
  appointmentId: string;
  date: string;
  time: string;
  professionalId?: string;
  locationId?: string;
  allowConflict?: boolean;
  /** Accepting a move made in Google (D-63): the time and duration set there. */
  googleChangeId?: string;
  durationMinutes?: number;
};

/** The pending Google change a status change accepts, resolved in the same transaction (D-63). */
type AcceptedGoogleChange = { id: string; userId: string };

/** The Professional records of the signed-in user in this practice. */
export async function ownProfessionalIds({ user, db }: PracticeContext) {
  return (await db.professional.findMany({ where: { userId: user.id }, select: { id: true } })).map((row) => row.id);
}

/** Roles that see only their own agenda reach only their own appointments. */
async function visibleFilter(context: PracticeContext) {
  return can(context.access.role, "agenda:view") ? {} : { professionalId: { in: await ownProfessionalIds(context) } };
}

async function actorFor(context: PracticeContext, professionalId: string): Promise<StatusActor> {
  const own = await ownProfessionalIds(context);
  return { kind: "user", role: context.access.role, ownsAppointment: own.includes(professionalId) };
}

/** Accepting a Google change is for whoever resolves them: the office, or the professional on their own agenda (D-10). */
async function assertResolvesGoogle(context: PracticeContext, professionalId: string) {
  const { role } = context.access;
  if (can(role, "google-changes:resolve")) return;
  if (can(role, "google-changes:resolve-own") && (await ownProfessionalIds(context)).includes(professionalId)) return;
  throw new AgendaError("not_allowed", "Cannot resolve Google changes");
}

async function findVisibleAppointment(context: PracticeContext, id: string) {
  if (!isUuid(id)) return null;
  return context.db.appointment.findFirst({ where: { id, ...(await visibleFilter(context)) } });
}

function isSerializationFailure(error: unknown) {
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "P2034" || (typeof message === "string" && /could not serialize|40001/.test(message));
}

async function serializable<T>(db: PracticeScopedClient, work: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.$transaction(work, { isolationLevel: "Serializable" });
    } catch (error) {
      if (attempt >= SERIALIZABLE_ATTEMPTS || !isSerializationFailure(error)) throw error;
    }
  }
}

/** What a new booking for the professional between the two instants would overlap. */
async function findConflicts(
  tx: Tx,
  slot: { professionalId: string; startsAt: Date; endsAt: Date; timeZone: string; ignoreAppointmentId?: string },
) {
  const overlap = { startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } };
  const [appointments, blocks] = await Promise.all([
    tx.appointment.findMany({
      where: {
        professionalId: slot.professionalId,
        status: { in: [...OCCUPYING_STATUSES] },
        ...overlap,
        ...(slot.ignoreAppointmentId ? { id: { not: slot.ignoreAppointmentId } } : {}),
      },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, endsAt: true, patient: { select: { name: true } } },
    }),
    tx.timeBlock.findMany({
      where: { professionalId: slot.professionalId, deletedAt: null, ...overlap },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, endsAt: true, reason: true, source: true },
    }),
  ]);
  const range = (row: { startsAt: Date; endsAt: Date }) =>
    `${formatTime(row.startsAt, slot.timeZone)}–${formatTime(row.endsAt, slot.timeZone)}`;
  return [
    ...appointments.map((row) => `${range(row)} · ${row.patient.name}`),
    ...blocks.map((row) => `${range(row)} · ${row.source === "GOOGLE" ? "Compromisso Google" : `Bloqueio${row.reason ? `: ${row.reason}` : ""}`}`),
  ];
}

async function findBookableProfessionalAndLocation({ db }: PracticeContext, professionalId: string, locationId: string) {
  const professional = isUuid(professionalId) ? await db.professional.findFirst({ where: { id: professionalId, active: true } }) : null;
  if (!professional) throw new AgendaError("professional_unavailable", "Professional not found or inactive");
  const location = isUuid(locationId)
    ? await db.location.findFirst({ where: { id: locationId, active: true, professionals: { some: { professionalId } } } })
    : null;
  if (!location) throw new AgendaError("location_unavailable", "The professional does not work at this location");
  return { professional, location };
}

function slotStart(date: string, time: string, timeZone: string) {
  if (!isIsoDate(date) || !isTime(time)) throw new AgendaError("invalid_date", "Invalid date or time");
  return zonedToUtc(date, time, timeZone);
}

function optionalText(value: string | null | undefined, max: number) {
  const text = value?.trim() || null;
  if (text && text.length > max) throw new AgendaError("invalid_text", "Text too long");
  return text;
}

/** Checks a booking and works out what is copied into it (D-12), before any write. */
async function prepareBooking(context: PracticeContext, input: CreateAppointmentInput) {
  const { access, db } = context;
  const { professional, location } = await findBookableProfessionalAndLocation(context, input.professionalId, input.locationId);
  const type = isUuid(input.appointmentTypeId)
    ? await db.appointmentType.findFirst({
        where: { id: input.appointmentTypeId, active: true },
        include: { prices: { where: { professionalId: professional.id } } },
      })
    : null;
  if (!type) throw new AgendaError("type_unavailable", "Appointment type not found or inactive");
  const patient = isUuid(input.patientId) ? await db.patient.findFirst({ where: { id: input.patientId, anonymizedAt: null } }) : null;
  if (!patient) throw new AgendaError("patient_unavailable", "Patient not found");

  const startsAt = slotStart(input.date, input.time, location.timeZone);
  const durationMinutes = input.durationMinutes ?? type.durationMinutes;
  if (!isValidDuration(durationMinutes)) throw new AgendaError("invalid_duration", "Invalid duration");
  // The professional's price for the type, else the type's (D-12). Only the manager changes it.
  const typePrice = type.prices[0]?.priceCents ?? type.defaultPriceCents;
  const priceCents = input.priceCents ?? typePrice;
  if (priceCents !== typePrice && !can(access.role, "appointments:edit-price")) throw new AgendaError("not_allowed", "Cannot change the price");
  if (!isValidPrice(priceCents)) throw new AgendaError("invalid_price", "Invalid price");
  if (input.leadSource && !(LEAD_SOURCES as readonly string[]).includes(input.leadSource)) throw new AgendaError("invalid_text", "Invalid lead source");
  const insurance = optionalText(input.insurance, MAX_INSURANCE) ?? patient.insurance ?? DEFAULT_INSURANCE;
  const internalNote = optionalText(input.internalNote, MAX_NOTE);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  return {
    timeZone: location.timeZone,
    data: {
      practiceId: access.practiceId,
      locationId: location.id,
      professionalId: professional.id,
      patientId: patient.id,
      appointmentTypeId: type.id,
      startsAt,
      endsAt,
      durationMinutes,
      priceCents,
      leadSource: input.leadSource ?? null,
      insurance,
      internalNote,
      createdByUserId: context.user.id,
    },
  };
}

export async function createAppointment(context: PracticeContext, input: CreateAppointmentInput) {
  const { access, db } = context;
  if (!can(access.role, "appointments:manage")) throw new AgendaError("not_allowed", "Cannot book");
  if (input.allowConflict && !can(access.role, "appointments:overbook")) throw new AgendaError("not_allowed", "Cannot overbook");
  const { timeZone, data } = await prepareBooking(context, input);

  const result = await serializable(db, async (tx) => {
    const conflicts = await findConflicts(tx, { ...data, timeZone });
    if (conflicts.length > 0 && !input.allowConflict) throw new AgendaError("conflict", "Slot taken", { details: conflicts });
    const appointment = await tx.appointment.create({ data });
    await recordCreation(tx, context, appointment.id, "USER");
    await planAppointmentCadence(tx, appointment.id, { now: new Date() });
    await markForGoogleSync(tx, [appointment.id]);
    await markForCrmSync(tx, [appointment.id]);
    return { id: appointment.id, overbooked: conflicts.length > 0 };
  });
  await requestGoogleSync(access.practiceId, [result.id], db);
  await requestCrmSync(access.practiceId, db);
  return result;
}

export type ImportAppointmentInput = Omit<CreateAppointmentInput, "allowConflict"> & { status: AppointmentStatus };

/**
 * One row of the agenda import (D-18, D-48): the checks of a booking, the cadence
 * off until the manager turns it on, IMPORT as the source, and the status the
 * previous system had. The same professional, patient and start found again is
 * "existing", so importing a sheet twice is safe. The import never overbooks; a
 * status that holds no time (Faltou, cancellations) is not checked for conflicts.
 */
export async function importAppointment(context: PracticeContext, input: ImportAppointmentInput, now = new Date()) {
  const { access, db } = context;
  if (!can(access.role, "patients:import") || !can(access.role, "appointments:manage")) throw new AgendaError("not_allowed", "Cannot import");
  if (!(IMPORTABLE_STATUSES as readonly AppointmentStatus[]).includes(input.status)) throw new AgendaError("invalid_status", `${input.status} is not importable`);
  const { timeZone, data } = await prepareBooking(context, input);
  if (data.startsAt > now && (input.status === "COMPLETED" || input.status === "NO_SHOW")) {
    throw new AgendaError("future_final_status", "A future appointment cannot be closed");
  }

  return serializable(db, async (tx) => {
    const existing = await tx.appointment.findFirst({
      where: { professionalId: data.professionalId, patientId: data.patientId, startsAt: data.startsAt },
      select: { id: true },
    });
    if (existing) return { id: existing.id, existing: true };
    if ((OCCUPYING_STATUSES as readonly AppointmentStatus[]).includes(input.status)) {
      const conflicts = await findConflicts(tx, { ...data, timeZone });
      if (conflicts.length > 0) throw new AgendaError("conflict", "Slot taken", { details: conflicts });
    }
    const appointment = await tx.appointment.create({ data: { ...data, cadenceEnabled: false } });
    await recordCreation(tx, context, appointment.id, "IMPORT");
    if (input.status !== "SCHEDULED") {
      await changeAppointmentStatus(context, { appointmentId: appointment.id, to: input.status, source: "IMPORT" }, tx);
    }
    // Exported with the cadence still off (D-18); importAgenda asks Inngest once for the whole sheet.
    await markForGoogleSync(tx, [appointment.id]);
    await markForCrmSync(tx, [appointment.id]);
    return { id: appointment.id, existing: false };
  });
}

async function recordCreation(tx: Tx, { user, access }: PracticeContext, appointmentId: string, source: "USER" | "IMPORT" | "GOOGLE") {
  await tx.appointmentStatusChange.create({
    data: { practiceId: access.practiceId, appointmentId, fromStatus: null, toStatus: "SCHEDULED", source, changedByUserId: user.id },
  });
  await tx.auditEvent.create({
    data: {
      practiceId: access.practiceId,
      actorType: "USER",
      actorUserId: user.id,
      action: source === "IMPORT" ? "appointment.imported" : "appointment.created",
      entityType: "Appointment",
      entityId: appointmentId,
      changedFields: [],
    },
  });
}

/** Who changed the status: a user of the practice, the patient through the cadence, or the CRM (no user). */
type StatusAuthor = { practiceId: string; userId: string | null; actorType: AuditActorType };

function authorOf(context: PracticeContext | CadenceActor | CrmActor): StatusAuthor {
  if (!("kind" in context)) return { practiceId: context.access.practiceId, userId: context.user.id, actorType: "USER" };
  return { practiceId: context.practiceId, userId: null, actorType: context.kind === "crm" ? "CRM" : "PATIENT" };
}

async function recordStatusChange(
  tx: Tx,
  author: StatusAuthor,
  change: { appointmentId: string; from: AppointmentStatus; to: AppointmentStatus; reason: string | null; source: StatusChangeSource },
  googleChange?: AcceptedGoogleChange,
) {
  const now = new Date();
  // Conditional on the status read before: a concurrent change makes this a no-op.
  const { count } = await tx.appointment.updateMany({ where: { id: change.appointmentId, status: change.from }, data: { status: change.to } });
  if (count === 0) throw new AgendaError("status_changed", "Status changed concurrently");
  await tx.appointmentStatusChange.create({
    data: {
      practiceId: author.practiceId,
      appointmentId: change.appointmentId,
      fromStatus: change.from,
      toStatus: change.to,
      source: change.source,
      reason: change.reason,
      changedByUserId: author.userId,
    },
  });
  await tx.auditEvent.create({
    data: {
      practiceId: author.practiceId,
      actorType: author.actorType,
      actorUserId: author.userId,
      action: "appointment.status_changed",
      entityType: "Appointment",
      entityId: change.appointmentId,
      changedFields: ["status"],
    },
  });
  await applyStatusChangeToCadence(tx, change.appointmentId, change.to, now);
  if (googleChange) {
    const { count: accepted } = await tx.pendingGoogleChange.updateMany({
      where: { id: googleChange.id, appointmentId: change.appointmentId, resolvedAt: null },
      data: { resolution: "ACCEPTED", resolvedAt: now, resolvedByUserId: googleChange.userId },
    });
    if (accepted === 0) throw new AgendaError("already_resolved", "The Google change was resolved meanwhile");
  }
  await supersedeGoogleChanges(tx, change.appointmentId, now, googleChange?.id);
  await markForGoogleSync(tx, [change.appointmentId], now);
  if (isCrmSyncedStatus(change.to)) await markForCrmSync(tx, [change.appointmentId], now);
  // The professional's phone hears about a confirmation (D-78); an imported status is history.
  if (change.to === "CONFIRMED" && change.source !== "IMPORT") await markForConfirmationPush(tx, change.appointmentId, author.userId, now);
}

/**
 * `from` is the status the person saw; if it changed meanwhile, nothing happens.
 * A correction between final statuses needs a reason (D-11).
 *
 * IMPORT as the source is the spreadsheet import setting the status the previous
 * system had (D-48): only for the importer, and only on an appointment whose one
 * history row is its import, inside the import's transaction (`tx`).
 *
 * With a CadenceActor the patient's WhatsApp reply sets the status (D-08): the
 * source is CADENCE_REPLY, and the table lets the cadence set only Confirmado and
 * Cancelado pelo paciente.
 *
 * With a CrmActor the secretary's confirmation made in SynkronosCRM sets the status
 * (D-66): the source is CRM, and the table lets it set only Confirmado.
 *
 * GOOGLE as the source is accepting an event deleted in Google (D-63): only for
 * whoever resolves Google changes, with the pending change resolved in the same
 * transaction.
 */
export async function changeAppointmentStatus(
  context: PracticeContext | CadenceActor | CrmActor,
  input: {
    appointmentId: string;
    to: AppointmentStatus;
    from?: AppointmentStatus;
    reason?: string | null;
    source?: "USER" | "IMPORT" | "GOOGLE";
    googleChangeId?: string;
  },
  tx?: Tx,
) {
  const automated = "kind" in context;
  const source: StatusChangeSource = automated ? (context.kind === "crm" ? "CRM" : "CADENCE_REPLY") : (input.source ?? "USER");
  if (!automated && source === "IMPORT" && !can(context.access.role, "patients:import")) throw new AgendaError("not_allowed", "Only the importer sets an imported status");
  if (!automated && source === "GOOGLE" && !input.googleChangeId) throw new AgendaError("not_allowed", "A Google status needs the pending change");
  const reader = tx ?? context.db;
  const appointment = isUuid(input.appointmentId)
    ? await reader.appointment.findFirst({ where: { id: input.appointmentId, ...(automated ? {} : await visibleFilter(context)) } })
    : null;
  if (!appointment) throw new AgendaError("not_found", "Appointment not found");
  if (input.from && input.from !== appointment.status) throw new AgendaError("status_changed", "Status changed since it was read");
  let actor: StatusActor;
  if (automated) {
    actor = context.kind === "crm" ? { kind: "crm" } : { kind: "cadence" };
  } else if (source === "GOOGLE") {
    await assertResolvesGoogle(context, appointment.professionalId);
    actor = { kind: "google" };
  } else if (source === "IMPORT") {
    const history = await reader.appointmentStatusChange.findMany({ where: { appointmentId: appointment.id }, select: { source: true } });
    if (history.length !== 1 || history[0].source !== "IMPORT") throw new AgendaError("not_allowed", "Not a freshly imported appointment");
    actor = { kind: "import" };
  } else {
    actor = await actorFor(context, appointment.professionalId);
  }
  const check = checkTransition(appointment.status, input.to, actor);
  if (!check.ok) throw new AgendaError(check.code, `${appointment.status} → ${input.to} refused`);
  const reason = optionalText(input.reason, MAX_REASON);
  if (check.reasonRequired && !reason) throw new AgendaError("reason_required", "A correction needs a reason");

  const change = { appointmentId: appointment.id, from: appointment.status, to: input.to, reason, source };
  const author = authorOf(context);
  const googleChange = !automated && input.googleChangeId ? { id: input.googleChangeId, userId: context.user.id } : undefined;
  if (tx) {
    // The caller asks Google after its own commit.
    await recordStatusChange(tx, author, change, googleChange);
    return;
  }
  await context.db.$transaction((transaction) => recordStatusChange(transaction, author, change, googleChange));
  await requestGoogleSync(author.practiceId, [appointment.id], context.db);
  await requestCrmSync(author.practiceId, context.db);
  if (input.to === "CONFIRMED") await requestConfirmationPush(author.practiceId);
}

/**
 * D-11: the new appointment keeps patient, type, duration and value; the original
 * becomes Reagendado. Accepting a move made in Google (googleChangeId, D-63) takes
 * the duration set there and records GOOGLE as the source.
 */
export async function rescheduleAppointment(context: PracticeContext, input: RescheduleInput) {
  const { user, access, db } = context;
  const original = await findVisibleAppointment(context, input.appointmentId);
  if (!original) throw new AgendaError("not_found", "Appointment not found");
  const fromGoogle = Boolean(input.googleChangeId);
  if (fromGoogle) await assertResolvesGoogle(context, original.professionalId);
  const actor: StatusActor = fromGoogle ? { kind: "google" } : await actorFor(context, original.professionalId);
  const check = checkTransition(original.status, "RESCHEDULED", actor, { via: "reschedule" });
  if (!check.ok) throw new AgendaError(check.code, `Cannot reschedule from ${original.status}`);
  if (input.allowConflict && !can(access.role, "appointments:overbook")) throw new AgendaError("not_allowed", "Cannot overbook");
  const durationMinutes = fromGoogle && input.durationMinutes !== undefined ? input.durationMinutes : original.durationMinutes;
  if (!isValidDuration(durationMinutes)) throw new AgendaError("invalid_duration", "Invalid duration");
  const source: StatusChangeSource = fromGoogle ? "GOOGLE" : "USER";

  const { professional, location } = await findBookableProfessionalAndLocation(
    context,
    input.professionalId || original.professionalId,
    input.locationId || original.locationId,
  );
  const startsAt = slotStart(input.date, input.time, location.timeZone);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

  const result = await serializable(db, async (tx) => {
    const conflicts = await findConflicts(tx, {
      professionalId: professional.id,
      startsAt,
      endsAt,
      timeZone: location.timeZone,
      ignoreAppointmentId: original.id,
    });
    if (conflicts.length > 0 && !input.allowConflict) throw new AgendaError("conflict", "Slot taken", { details: conflicts });
    await recordStatusChange(
      tx,
      authorOf(context),
      { appointmentId: original.id, from: original.status, to: "RESCHEDULED", reason: null, source },
      input.googleChangeId ? { id: input.googleChangeId, userId: user.id } : undefined,
    );
    const created = await tx.appointment.create({
      data: {
        practiceId: access.practiceId,
        locationId: location.id,
        professionalId: professional.id,
        patientId: original.patientId,
        appointmentTypeId: original.appointmentTypeId,
        startsAt,
        endsAt,
        durationMinutes,
        priceCents: original.priceCents,
        leadSource: original.leadSource,
        insurance: original.insurance,
        internalNote: original.internalNote,
        cadenceEnabled: original.cadenceEnabled,
        rescheduledFromId: original.id,
        createdByUserId: user.id,
      },
    });
    await recordCreation(tx, context, created.id, source === "GOOGLE" ? "GOOGLE" : "USER");
    // The cadence restarts from the new time, on the new appointment (D-11).
    await planAppointmentCadence(tx, created.id, { now: new Date() });
    await markForGoogleSync(tx, [created.id]);
    await markForCrmSync(tx, [created.id]);
    return { id: created.id, overbooked: conflicts.length > 0 };
  });
  // The original's event goes and the new one's comes (D-62).
  await requestGoogleSync(access.practiceId, [original.id, result.id], db);
  await requestCrmSync(access.practiceId, db);
  return result;
}

export type AppointmentDetail = NonNullable<Awaited<ReturnType<typeof getAppointmentDetail>>>;

export async function getAppointmentDetail(context: PracticeContext, appointmentId: string) {
  if (!isUuid(appointmentId)) return null;
  const { db } = context;
  const appointment = await db.appointment.findFirst({
    where: { id: appointmentId, ...(await visibleFilter(context)) },
    include: {
      patient: { select: { id: true, name: true, phone: true } },
      professional: { select: { id: true, name: true, secondaryCalendar: { select: { id: true } } } },
      location: { select: { id: true, name: true, address: true, timeZone: true } },
      appointmentType: { select: { id: true, name: true, displayName: true, category: true, color: true, cadence: { select: { name: true } } } },
      flags: { where: { resolvedAt: null }, select: { type: true } },
      statusChanges: { orderBy: { changedAt: "asc" } },
      rescheduledFrom: { select: { id: true, startsAt: true, status: true } },
      rescheduledTo: { select: { id: true, startsAt: true, status: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!appointment) return null;

  // Members of the practice, revoked ones included; an organization admin has no membership.
  const authorIds = [...new Set(appointment.statusChanges.flatMap((change) => (change.changedByUserId ? [change.changedByUserId] : [])))];
  const authors = new Map(
    (await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })).map((author) => [author.id, author.name]),
  );
  const own = await ownProfessionalIds(context);
  const crmConnected = (await db.crmConnection.count()) > 0;

  return {
    id: appointment.id,
    status: appointment.status,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    durationMinutes: appointment.durationMinutes,
    priceCents: appointment.priceCents,
    insurance: appointment.insurance,
    leadSource: appointment.leadSource,
    internalNote: appointment.internalNote,
    cadenceEnabled: appointment.cadenceEnabled,
    patient:{ ...appointment.patient, phone: formatPhone(appointment.patient.phone) },
    professional: { id: appointment.professional.id, name: appointment.professional.name },
    location: appointment.location,
    // Its event in the professional's secondary calendar (D-62).
    google: {
      linked: Boolean(appointment.professional.secondaryCalendar),
      inCalendar: Boolean(appointment.googleEventId),
      exporting: Boolean(appointment.googleSyncRequestedAt),
      error: appointment.googleSyncError,
    },
    // Its note and status tag in SynkronosCRM (D-68).
    crm: {
      connected: crmConnected,
      inConversation: Boolean(appointment.crmSyncedAt),
      exporting: Boolean(appointment.crmSyncRequestedAt),
      error: appointment.crmSyncError,
    },
    type: { ...appointment.appointmentType, cadenceName: appointment.appointmentType.cadence?.name ?? null },
    flags: appointment.flags.map((flag) => flag.type),
    ownsAppointment: own.includes(appointment.professionalId),
    history: appointment.statusChanges.map((change) => ({
      id: change.id,
      fromStatus: change.fromStatus,
      toStatus: change.toStatus,
      reason: change.reason,
      changedAt: change.changedAt,
      authorName: change.changedByUserId ? (authors.get(change.changedByUserId) ?? ORG_ADMIN_AUTHOR) : STATUS_SOURCE_LABELS[change.source],
    })),
    rescheduledFrom: appointment.rescheduledFrom,
    rescheduledTo: appointment.rescheduledTo,
  };
}
