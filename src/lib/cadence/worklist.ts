import type { AppointmentFlagType, AppointmentStatus } from "@/generated/prisma/enums";
import { AgendaError } from "@/lib/agenda/errors";
import { ownProfessionalIds } from "@/lib/appointments/appointments";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid, type PracticeTransaction } from "@/lib/db";
import { describeCadenceStep } from "@/lib/domain/cadence";
import { formatPhone } from "@/lib/patients/phone";
import { requestDrain } from "@/lib/inngest/client";
import { CADENCE_APPOINTMENT_STATUSES, cancelConfirmationRequests, hasGrantedConsent, SENT_DISPATCH_STATUSES } from "./plan";
import { renderTemplate } from "./template";

/**
 * What the office sees and does with the cadence of each appointment (PRD 6, rules
 * 3 and 4; D-06; PRD 11 "Log de disparos" and "Sem confirmação"):
 *
 * - the dispatch log: each step with its time, delivery status, reason and reply;
 * - a manual dispatch of a step's text, at any time (the 4 h limit is for automatic ones);
 * - the manual contact, which ends the confirmation requests;
 * - resuming a cadence paused by a free-text reply;
 * - the follow-up lists: Sem confirmação, Pediu remarcação, Respondeu sem confirmar.
 */

export type CadenceSituation = "active" | "off" | "no_consent" | "no_cadence" | "no_instance" | "paused" | "closed";

async function findAppointment(context: PracticeContext, appointmentId: string) {
  if (!isUuid(appointmentId)) return null;
  const own = can(context.access.role, "agenda:view") ? null : await ownProfessionalIds(context);
  return context.db.appointment.findFirst({
    where: { id: appointmentId, ...(own ? { professionalId: { in: own } } : {}) },
    include: {
      patient: { select: { id: true, name: true, phone: true } },
      professional: { select: { id: true, name: true, whatsappInstance: { select: { id: true, status: true } } } },
      location: { select: { address: true, timeZone: true } },
      appointmentType: {
        select: {
          displayName: true,
          category: true,
          preparation: true,
          cadence: { select: { id: true, name: true, version: true, active: true, professionals: { select: { professionalId: true } } } },
        },
      },
      flags: { where: { resolvedAt: null }, select: { type: true } },
    },
  });
}

type FoundAppointment = NonNullable<Awaited<ReturnType<typeof findAppointment>>>;

function isOpenAndAhead(appointment: { status: AppointmentStatus; startsAt: Date }, now: Date) {
  return (CADENCE_APPOINTMENT_STATUSES as readonly AppointmentStatus[]).includes(appointment.status) && appointment.startsAt > now;
}

/** The cadence that applies to the appointment, if active and covering its professional. */
function cadenceOf(appointment: FoundAppointment) {
  const cadence = appointment.appointmentType.cadence;
  if (!cadence?.active) return null;
  if (cadence.professionals.length > 0 && !cadence.professionals.some((row) => row.professionalId === appointment.professional.id)) return null;
  return cadence;
}

function templateValues(appointment: FoundAppointment) {
  return {
    patientName: appointment.patient.name,
    professionalName: appointment.professional.name,
    type: appointment.appointmentType,
    startsAt: appointment.startsAt,
    timeZone: appointment.location.timeZone,
    address: appointment.location.address,
    priceCents: appointment.priceCents,
  };
}

/** The dispatch log of one appointment, for whoever sees the appointment and the log. */
export async function getDispatchLog(context: PracticeContext, appointmentId: string, now = new Date()) {
  const { access, db } = context;
  if (!can(access.role, "dispatch-log:view") && !can(access.role, "dispatch-log:view-own")) return null;
  const appointment = await findAppointment(context, appointmentId);
  if (!appointment) return null;

  const cadence = cadenceOf(appointment);
  const consent = await hasGrantedConsent(db, appointment.patient.id);
  const instance = appointment.professional.whatsappInstance;
  const situation: CadenceSituation = !isOpenAndAhead(appointment, now)
    ? "closed"
    : !appointment.cadenceEnabled
      ? "off"
      : !cadence
        ? "no_cadence"
        : !consent
          ? "no_consent"
          : !instance
            ? "no_instance"
            : appointment.flags.some((flag) => flag.type === "REPLIED_WITHOUT_CONFIRMING")
              ? "paused"
              : "active";

  const dispatches = await db.dispatch.findMany({
    where: { appointmentId: appointment.id },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    include: { cadenceStep: { select: { position: true, cadenceVersion: true, anchor: true, offsetMinutes: true, fixedTime: true, action: true, template: true } } },
  });
  const steps = cadence ? await db.cadenceStep.findMany({ where: { cadenceId: cadence.id, cadenceVersion: cadence.version }, orderBy: { position: "asc" } }) : [];
  const canSendManually = can(access.role, "dispatch:manual") && situation !== "closed" && consent && Boolean(instance) && Boolean(cadence);

  return {
    situation,
    cadenceName: appointment.appointmentType.cadence?.name ?? null,
    instanceStatus: instance?.status ?? null,
    timeZone: appointment.location.timeZone,
    entries: dispatches.map((dispatch) => ({
      id: dispatch.id,
      position: dispatch.cadenceStep?.position ?? null,
      version: dispatch.cadenceStep?.cadenceVersion ?? dispatch.cadenceVersion,
      description: dispatch.cadenceStep ? describeCadenceStep(dispatch.cadenceStep) : "Mensagem",
      manual: dispatch.manual,
      status: dispatch.status,
      reason: dispatch.statusReason,
      scheduledFor: dispatch.scheduledFor,
      sentAt: dispatch.sentAt,
      // What went out, or what will go if nothing changes.
      text: dispatch.messageText ?? (dispatch.status === "SCHEDULED" && dispatch.cadenceStep ? renderTemplate(dispatch.cadenceStep.template, templateValues(appointment)) : null),
      replyText: dispatch.replyText,
      repliedAt: dispatch.repliedAt,
    })),
    manualSteps: canSendManually ? steps.map((step) => ({ id: step.id, label: `Passo ${step.position} · ${describeCadenceStep(step)}` })) : [],
    canRecordContact: can(access.role, "appointments:manage") && isOpenAndAhead(appointment, now),
    canResume: can(access.role, "appointments:manage") && situation === "paused",
  };
}

async function openAppointmentFor(context: PracticeContext, appointmentId: string, now: Date) {
  const appointment = await findAppointment(context, appointmentId);
  if (!appointment) throw new AgendaError("not_found", "Appointment not found");
  if (!isOpenAndAhead(appointment, now)) throw new AgendaError("appointment_not_open", "Appointment closed or past");
  return appointment;
}

function audit(context: PracticeContext, action: string, entityType: string, entityId: string, changedFields: string[]) {
  return context.db.auditEvent.create({
    data: { practiceId: context.access.practiceId, actorType: "USER", actorUserId: context.user.id, action, entityType, entityId, changedFields },
  });
}

/** PRD 6, rule 3: the step's text, now, logged as manual. The sender still checks consent. */
export async function queueManualDispatch(
  context: PracticeContext,
  input: { appointmentId: string; stepId: string },
  now = new Date(),
  deps: { drain?: typeof requestDrain } = {},
) {
  const { access, db } = context;
  if (!can(access.role, "dispatch:manual")) throw new AgendaError("not_allowed", "Cannot send manually");
  const appointment = await openAppointmentFor(context, input.appointmentId, now);
  const cadence = cadenceOf(appointment);
  const step = cadence && isUuid(input.stepId) ? await db.cadenceStep.findFirst({ where: { id: input.stepId, cadenceId: cadence.id, cadenceVersion: cadence.version } }) : null;
  if (!cadence || !step) throw new AgendaError("step_unavailable", "Step not in the appointment's cadence");
  if (!(await hasGrantedConsent(db, appointment.patient.id))) throw new AgendaError("no_consent", "No WhatsApp consent");
  const instance = appointment.professional.whatsappInstance;
  if (!instance) throw new AgendaError("no_instance", "The professional has no instance");

  const dispatch = await db.$transaction(async (tx) => {
    const created = await tx.dispatch.create({
      data: {
        practiceId: access.practiceId,
        appointmentId: appointment.id,
        cadenceStepId: step.id,
        cadenceVersion: cadence.version,
        whatsappInstanceId: instance.id,
        manual: true,
        scheduledFor: now,
      },
    });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: context.user.id, action: "dispatch.manual", entityType: "Dispatch", entityId: created.id, changedFields: [] },
    });
    return created;
  });
  await (deps.drain ?? requestDrain)(access.practiceId, instance.id);
  return dispatch.id;
}

/** What a manual contact does, in the caller's transaction (D-06), from the agenda or from SynkronosCRM (D-66). */
export async function applyManualContact(
  tx: PracticeTransaction,
  input: { practiceId: string; appointmentId: string; actor: { type: "USER"; userId: string } | { type: "CRM"; userId: null } },
  now: Date,
) {
  const { practiceId, appointmentId, actor } = input;
  await tx.appointmentFlag.create({ data: { practiceId, appointmentId, type: "MANUAL_CONTACT", createdAt: now, resolvedAt: now } });
  await cancelConfirmationRequests(tx, appointmentId, "manual_contact");
  await tx.appointmentFlag.updateMany({
    where: { appointmentId, resolvedAt: null, type: { in: ["NO_CONFIRMATION", "REPLIED_WITHOUT_CONFIRMING"] } },
    data: { resolvedAt: now },
  });
  await tx.auditEvent.create({
    data: { practiceId, actorType: actor.type, actorUserId: actor.userId, action: "appointment.manual_contact", entityType: "Appointment", entityId: appointmentId, changedFields: ["flags"] },
  });
}

/** D-06: the office reached the patient; the confirmation requests end and the follow-up flags close. */
export async function recordManualContact(context: PracticeContext, appointmentId: string, now = new Date()) {
  if (!can(context.access.role, "appointments:manage")) throw new AgendaError("not_allowed", "Cannot record contact");
  const appointment = await openAppointmentFor(context, appointmentId, now);
  await context.db.$transaction((tx) =>
    applyManualContact(tx, { practiceId: context.access.practiceId, appointmentId: appointment.id, actor: { type: "USER", userId: context.user.id } }, now),
  );
}

/** The office answered the free-text reply in SynkronosCRM: the cadence goes on (D-05). */
export async function resumeCadence(context: PracticeContext, appointmentId: string, now = new Date()) {
  if (!can(context.access.role, "appointments:manage")) throw new AgendaError("not_allowed", "Cannot resume");
  const appointment = await openAppointmentFor(context, appointmentId, now);
  const { count } = await context.db.appointmentFlag.updateMany({
    where: { appointmentId: appointment.id, type: "REPLIED_WITHOUT_CONFIRMING", resolvedAt: null },
    data: { resolvedAt: now },
  });
  if (count > 0) await audit(context, "appointment.cadence_resumed", "Appointment", appointment.id, ["flags"]);
}

const FOLLOW_UP_STATUSES: Record<"NO_CONFIRMATION" | "RESCHEDULE_REQUESTED" | "REPLIED_WITHOUT_CONFIRMING", AppointmentStatus[]> = {
  NO_CONFIRMATION: ["SCHEDULED"],
  RESCHEDULE_REQUESTED: ["SCHEDULED", "CONFIRMED"],
  REPLIED_WITHOUT_CONFIRMING: ["SCHEDULED"],
};

export type FollowUp = Awaited<ReturnType<typeof listFollowUps>>[keyof Awaited<ReturnType<typeof listFollowUps>>][number];

/** The "Sem confirmação" work list (PRD 6 and 11), with the patients' other answers that wait for the office. */
export async function listFollowUps(context: PracticeContext, now = new Date()) {
  const { access, db } = context;
  if (!can(access.role, "agenda:view")) throw new AgendaError("not_allowed", "Cannot see the work lists");
  const load = async (type: keyof typeof FOLLOW_UP_STATUSES) => {
    const rows = await db.appointment.findMany({
      where: { startsAt: { gt: now }, status: { in: FOLLOW_UP_STATUSES[type] }, flags: { some: { type: type as AppointmentFlagType, resolvedAt: null } } },
      orderBy: { startsAt: "asc" },
      take: 200,
      select: {
        id: true,
        status: true,
        startsAt: true,
        patient: { select: { name: true, phone: true } },
        professional: { select: { name: true } },
        location: { select: { timeZone: true } },
        appointmentType: { select: { name: true } },
        flags: { where: { type: type as AppointmentFlagType, resolvedAt: null }, select: { createdAt: true }, take: 1 },
        dispatches: {
          where: { status: { in: [...SENT_DISPATCH_STATUSES] } },
          orderBy: { sentAt: "desc" },
          take: 1,
          select: { sentAt: true, replyText: true, repliedAt: true },
        },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      startsAt: row.startsAt,
      timeZone: row.location.timeZone,
      patientName: row.patient.name,
      patientPhone: formatPhone(row.patient.phone),
      professionalName: row.professional.name,
      typeName: row.appointmentType.name,
      flaggedAt: row.flags[0]?.createdAt ?? null,
      lastSentAt: row.dispatches[0]?.sentAt ?? null,
      lastReply: row.dispatches[0]?.replyText ?? null,
    }));
  };
  return {
    unconfirmed: await load("NO_CONFIRMATION"),
    rescheduleRequested: await load("RESCHEDULE_REQUESTED"),
    repliedWithoutConfirming: await load("REPLIED_WITHOUT_CONFIRMING"),
  };
}
