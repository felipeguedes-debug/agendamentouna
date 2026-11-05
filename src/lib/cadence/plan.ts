import type { Prisma } from "@/generated/prisma/client";
import type { AppointmentFlagType, AppointmentStatus } from "@/generated/prisma/enums";
import type { PracticeScopedClient, PracticeTransaction } from "@/lib/db";
import { CANCELED_STATUSES } from "@/lib/appointments/status";
import { planSteps, type SendWindow } from "./schedule";

/**
 * The dispatches of each appointment (PRD 6; D-06, D-07, D-11, D-18, D-47).
 *
 * - An appointment enters the cadence when it is booked (or rescheduled, or its
 *   imported cadence is turned on) with the cadence on, the patient's latest
 *   consent "granted", an active cadence for its type that covers the professional.
 *   Every step becomes a Dispatch: SCHEDULED at its time, or SKIPPED with the reason.
 * - A status change cancels what no longer applies: confirmation ends the steps that
 *   ask for it (D-06), and every status ends the steps it is not eligible for, so
 *   cancellation and rescheduling end the whole cadence. It also resolves the flags
 *   the cadence opened.
 * - A cadence change keeps the dispatches of the next 24 h as they are and replans
 *   the rest with the current version (PRD 6, rule 7).
 * - Revoking consent cancels the patient's scheduled dispatches; granting it plans
 *   the patient's future appointments.
 *
 * Everything runs in the caller's transaction (`PracticeTransaction`) or in the scoped client.
 */

export type CadenceDb = PracticeTransaction;

/** Appointments the cadence talks about: still waiting for the visit. */
export const CADENCE_APPOINTMENT_STATUSES = ["SCHEDULED", "CONFIRMED"] as const satisfies readonly AppointmentStatus[];

/** Messages that went out (D-08 looks for the latest of them). */
export const SENT_DISPATCH_STATUSES = ["SENT", "DELIVERED", "READ"] as const;

/** Flags opened by the cadence; any status change resolves them. */
export const CADENCE_FLAGS = ["NO_CONFIRMATION", "REPLIED_WITHOUT_CONFIRMING", "RESCHEDULE_REQUESTED"] as const satisfies readonly AppointmentFlagType[];

/** A cadence change leaves the dispatches of the next 24 h alone (PRD 6, rule 7). */
export const KEEP_ON_CHANGE_MS = 24 * 3_600_000;

/**
 * Why a dispatch was skipped, canceled or failed, or how its time moved (Dispatch.statusReason).
 * The labels are in src/lib/domain/labels.ts.
 */
export type DispatchReason =
  // Planning (D-07)
  | "anticipated"
  | "postponed"
  | "rate_limited"
  | "passed"
  | "outside_window"
  | "rate_limit"
  // Status and consent
  | "confirmed"
  | "canceled"
  | "rescheduled"
  | "status_changed"
  | "manual_contact"
  | "consent_revoked"
  | "cadence_changed"
  // Sending
  | "not_eligible"
  | "no_consent"
  | "cadence_off"
  | "paused"
  | "appointment_passed"
  | "instance_disconnected"
  | "overdue"
  | "no_instance"
  | "no_phone"
  | "send_error";

export async function practiceSendWindow(db: CadenceDb): Promise<{ window: SendWindow; marginMinutes: number }> {
  const practice = await db.practice.findFirstOrThrow({
    select: { sendWindowStart: true, sendWindowEnd: true, sendWindowDays: true, sendMarginMinutes: true },
  });
  return {
    window: { start: practice.sendWindowStart, end: practice.sendWindowEnd, days: practice.sendWindowDays },
    marginMinutes: practice.sendMarginMinutes,
  };
}

/** The latest consent row decides (D-47); only "granted" enters the cadence. */
export async function hasGrantedConsent(db: CadenceDb, patientId: string) {
  return (await patientsWithGrantedConsent(db, [patientId])).has(patientId);
}

async function patientsWithGrantedConsent(db: CadenceDb, patientIds: string[]) {
  const latest = await db.contactConsent.findMany({
    where: { patientId: { in: patientIds } },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    distinct: ["patientId"],
    select: { patientId: true, granted: true },
  });
  return new Set(latest.filter((row) => row.granted).map((row) => row.patientId));
}

/**
 * Plans the steps of each appointment's cadence that it has no dispatch for yet, in
 * a fixed number of queries whatever the batch size (the batch activation of an
 * import can hold 2,000 appointments). `startedAt` is the moment the cadence starts
 * ("ao agendar"); `onlyAfter` limits a replan to the steps after that instant,
 * without recording the skipped ones. Returns how many dispatches it wrote.
 */
export async function planCadences(db: CadenceDb, appointmentIds: readonly string[], options: { now: Date; startedAt?: Date; onlyAfter?: Date }) {
  const { now, onlyAfter } = options;
  if (appointmentIds.length === 0) return 0;
  const candidates = await db.appointment.findMany({
    where: { id: { in: [...appointmentIds] }, cadenceEnabled: true, startsAt: { gt: now }, status: { in: [...CADENCE_APPOINTMENT_STATUSES] } },
    orderBy: { startsAt: "asc" },
    select: { id: true, practiceId: true, startsAt: true, patientId: true, professionalId: true, appointmentTypeId: true, location: { select: { timeZone: true } } },
  });
  if (candidates.length === 0) return 0;
  const consenting = await patientsWithGrantedConsent(db, unique(candidates.map((row) => row.patientId)));
  const appointments = candidates.filter((row) => consenting.has(row.patientId));
  if (appointments.length === 0) return 0;

  // The active cadence of each type, with the steps of its current version.
  const types = await db.appointmentType.findMany({
    where: { id: { in: unique(appointments.map((row) => row.appointmentTypeId)) }, cadence: { is: { active: true } } },
    select: { id: true, cadence: { select: { id: true, version: true, professionals: { select: { professionalId: true } } } } },
  });
  const cadenceIds = unique(types.flatMap((type) => (type.cadence ? [type.cadence.id] : [])));
  const steps = await db.cadenceStep.findMany({ where: { cadenceId: { in: cadenceIds } }, orderBy: { position: "asc" } });
  const cadenceOfType = new Map(
    types.flatMap((type) =>
      type.cadence
        ? [[type.id, { ...type.cadence, steps: steps.filter((step) => step.cadenceId === type.cadence!.id && step.cadenceVersion === type.cadence!.version) }] as const]
        : [],
    ),
  );

  const ids = appointments.map((row) => row.id);
  const patientIds = unique(appointments.map((row) => row.patientId));
  const planned = await db.dispatch.findMany({
    where: { appointmentId: { in: ids }, manual: false, status: { not: "CANCELED" }, cadenceStepId: { not: null } },
    select: { appointmentId: true, cadenceStepId: true },
  });
  // The patient's other automatic messages, sent or scheduled (the 4 h limit, D-07).
  const sends = await db.dispatch.findMany({
    where: { appointment: { patientId: { in: patientIds } }, manual: false, status: { in: ["SCHEDULED", ...SENT_DISPATCH_STATUSES] } },
    select: { scheduledFor: true, sentAt: true, appointment: { select: { patientId: true } } },
  });
  const instances = await db.whatsappInstance.findMany({
    where: { professionalId: { in: unique(appointments.map((row) => row.professionalId)) } },
    select: { id: true, professionalId: true },
  });
  const { window, marginMinutes } = await practiceSendWindow(db);
  const plannedSteps = new Set(planned.map((row) => `${row.appointmentId}:${row.cadenceStepId}`));
  const sendsOf = new Map<string, Date[]>();
  for (const send of sends) sendsOf.set(send.appointment.patientId, [...(sendsOf.get(send.appointment.patientId) ?? []), send.sentAt ?? send.scheduledFor]);
  const instanceOf = new Map(instances.map((row) => [row.professionalId, row.id]));

  const rows: Prisma.DispatchCreateManyInput[] = [];
  for (const appointment of appointments) {
    const cadence = cadenceOfType.get(appointment.appointmentTypeId);
    if (!cadence) continue;
    if (cadence.professionals.length > 0 && !cadence.professionals.some((row) => row.professionalId === appointment.professionalId)) continue;
    const pending = cadence.steps.filter((step) => !plannedSteps.has(`${appointment.id}:${step.id}`));
    if (pending.length === 0) continue;
    const previousSends = sendsOf.get(appointment.patientId) ?? [];
    const results = planSteps({
      steps: pending,
      startedAt: options.startedAt ?? now,
      startsAt: appointment.startsAt,
      timeZone: appointment.location.timeZone,
      window,
      marginMinutes,
      previousSends,
    });
    for (const result of results) {
      if (onlyAfter && !("at" in result && result.at > onlyAfter)) continue;
      const base = {
        practiceId: appointment.practiceId,
        appointmentId: appointment.id,
        cadenceStepId: result.stepId,
        cadenceVersion: cadence.version,
        whatsappInstanceId: instanceOf.get(appointment.professionalId) ?? null,
      };
      if ("at" in result) {
        rows.push({ ...base, scheduledFor: result.at, status: "SCHEDULED", statusReason: result.adjustment === "none" ? null : result.adjustment });
        // Later appointments of the same patient in this batch keep the 4 h from it.
        previousSends.push(result.at);
        sendsOf.set(appointment.patientId, previousSends);
      } else {
        rows.push({ ...base, scheduledFor: result.nominal, status: "SKIPPED", statusReason: result.skipped });
      }
    }
  }
  if (rows.length > 0) await db.dispatch.createMany({ data: rows });
  return rows.length;
}

/** One appointment: booking, rescheduling. */
export function planAppointmentCadence(db: CadenceDb, appointmentId: string, options: { now: Date; startedAt?: Date; onlyAfter?: Date }) {
  return planCadences(db, [appointmentId], options);
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function cancellationReason(to: AppointmentStatus): DispatchReason {
  if (to === "CONFIRMED") return "confirmed";
  if ((CANCELED_STATUSES as readonly AppointmentStatus[]).includes(to)) return "canceled";
  if (to === "RESCHEDULED") return "rescheduled";
  return "status_changed";
}

/** Runs inside every status change (src/lib/appointments/appointments.ts). */
export async function applyStatusChangeToCadence(db: CadenceDb, appointmentId: string, to: AppointmentStatus, now: Date) {
  await db.dispatch.updateMany({
    where: {
      appointmentId,
      status: "SCHEDULED",
      OR: [
        ...(to === "CONFIRMED" ? [{ cadenceStep: { is: { action: "REQUEST_CONFIRMATION" as const } } }] : []),
        { cadenceStep: { is: { NOT: { eligibleStatuses: { has: to } } } } },
        { cadenceStepId: null },
      ],
    },
    data: { status: "CANCELED", statusReason: cancellationReason(to), lockedUntil: null },
  });
  await db.appointmentFlag.updateMany({
    where: { appointmentId, resolvedAt: null, type: { in: [...CADENCE_FLAGS] } },
    data: { resolvedAt: now },
  });
}

/** Ends the confirmation requests of an appointment (manual contact, D-06). */
export async function cancelConfirmationRequests(db: CadenceDb, appointmentId: string, reason: DispatchReason) {
  await db.dispatch.updateMany({
    where: { appointmentId, status: "SCHEDULED", cadenceStep: { is: { action: "REQUEST_CONFIRMATION" } } },
    data: { status: "CANCELED", statusReason: reason, lockedUntil: null },
  });
}

/** Runs inside every consent change (src/lib/patients/consent.ts and the PARAR reply). */
export async function applyConsentToCadence(db: CadenceDb, patientId: string, granted: boolean, now: Date) {
  if (!granted) {
    await db.dispatch.updateMany({
      where: { status: "SCHEDULED", appointment: { patientId } },
      data: { status: "CANCELED", statusReason: "consent_revoked", lockedUntil: null },
    });
    return;
  }
  const appointments = await db.appointment.findMany({ where: { patientId, startsAt: { gt: now } }, select: { id: true } });
  await planCadences(db, appointments.map((row) => row.id), { now });
}

/**
 * After a cadence or a type changes: for each future appointment the change may
 * touch, the dispatches of the next 24 h stay, the later ones are canceled and the
 * current version is planned after that horizon (PRD 6, rule 7).
 */
export async function replanAppointments(db: PracticeScopedClient, where: Prisma.AppointmentWhereInput, now: Date) {
  const horizon = new Date(now.getTime() + KEEP_ON_CHANGE_MS);
  const appointments = await db.appointment.findMany({
    where: { AND: [where, { startsAt: { gt: now }, status: { in: [...CADENCE_APPOINTMENT_STATUSES] } }] },
    select: { id: true },
  });
  const ids = appointments.map((row) => row.id);
  await db.$transaction(async (tx) => {
    await tx.dispatch.updateMany({
      where: { appointmentId: { in: ids }, status: "SCHEDULED", manual: false, scheduledFor: { gt: horizon } },
      data: { status: "CANCELED", statusReason: "cadence_changed", lockedUntil: null },
    });
    await planCadences(tx, ids, { now, onlyAfter: horizon });
  });
  return ids.length;
}
