import type { AppointmentFlagType } from "@/generated/prisma/enums";
import { AgendaError } from "@/lib/agenda/errors";
import { changeAppointmentStatus } from "@/lib/appointments/appointments";
import { forPractice, type PracticeScopedClient, type PracticeTransaction } from "@/lib/db";
import { normalizePhone, phoneDigits, phoneVariants } from "@/lib/patients/phone";
import { applyConsentToCadence, hasGrantedConsent, SENT_DISPATCH_STATUSES } from "./plan";

/**
 * The patient's answers (PRD 6 "Respostas e ações", D-05, D-08). They come only
 * from the WhatsAPI webhook: the same number is connected to SynkronosCRM, which
 * receives them too, so reading them there as well would process each one twice.
 *
 * - Only an exact answer counts, after normalizing (lower case, no accents, no
 *   spaces or punctuation at the ends): "1", "sim", "confirmo"; "2", "remarcar";
 *   "3", "nao", "cancelar". Anything else, media included, is free text.
 * - The answer applies to the appointment of the latest cadence message this
 *   instance sent to this patient, as long as the appointment is still ahead.
 * - Confirm and cancel change the status through changeAppointmentStatus with the
 *   cadence as the actor (CADENCE_REPLY). "2" only flags Pediu remarcação in the MVP.
 *   Free text on an Agendado appointment flags Respondeu sem confirmar, which pauses
 *   the cadence until the office resumes it.
 * - "PARAR" revokes the WhatsApp consent with a new row of the append-only log (D-47).
 */

export type ReplyKind = "confirm" | "reschedule" | "cancel" | "stop" | "free_text";

const ANSWERS: Record<string, ReplyKind> = {
  "1": "confirm",
  sim: "confirm",
  confirmo: "confirm",
  "2": "reschedule",
  remarcar: "reschedule",
  "3": "cancel",
  nao: "cancel",
  cancelar: "cancel",
  parar: "stop",
};

const MAX_REPLY = 1000;

export function normalizeReply(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, "");
}

export function readReply(text: string): ReplyKind {
  return ANSWERS[normalizeReply(text)] ?? "free_text";
}

/**
 * The E.164 numbers a WhatsApp id may stand for. Brazilian mobiles registered before
 * the ninth digit often keep the old 8-digit id ("558598124455"), so both forms are tried.
 */
export function phoneCandidates(jid: string) {
  const [user, server = "s.whatsapp.net"] = jid.split("@");
  if (server !== "s.whatsapp.net" && server !== "c.us") return [];
  const phone = normalizePhone(phoneDigits(user.split(":")[0]));
  return phone ? phoneVariants(phone) : [];
}

export type IncomingMessage = {
  /** The chat or sender id ("5585998124455@s.whatsapp.net"); the phone-number form when the provider gives it. */
  from: string;
  text: string;
  fromMe: boolean;
  isGroup: boolean;
};

export type ReplyOutcome =
  | { result: "ignored"; reason: "own_message" | "group" | "unknown_sender" | "no_cadence_message" | "appointment_passed" }
  | { result: "stopped"; patientId: string }
  | { result: "confirmed" | "canceled" | "reschedule_requested" | "free_text" | "recorded"; appointmentId: string };

export async function handleIncomingMessage(practiceId: string, instanceId: string, message: IncomingMessage, now = new Date()): Promise<ReplyOutcome> {
  if (message.fromMe) return { result: "ignored", reason: "own_message" };
  if (message.isGroup) return { result: "ignored", reason: "group" };
  const db = forPractice(practiceId);
  const phones = phoneCandidates(message.from);
  const patient = phones.length > 0 ? await db.patient.findFirst({ where: { phone: { in: phones }, anonymizedAt: null }, select: { id: true } }) : null;
  if (!patient) return { result: "ignored", reason: "unknown_sender" };

  const kind = readReply(message.text);
  const target = await db.dispatch.findFirst({
    where: { whatsappInstanceId: instanceId, status: { in: [...SENT_DISPATCH_STATUSES] }, appointment: { patientId: patient.id } },
    orderBy: { sentAt: "desc" },
    select: { id: true, appointment: { select: { id: true, status: true, startsAt: true } } },
  });
  const appointment = target && target.appointment.startsAt > now ? target.appointment : null;
  if (target && appointment) {
    await db.dispatch.update({ where: { id: target.id }, data: { replyText: message.text.slice(0, MAX_REPLY), repliedAt: now, status: "READ" } });
  }

  if (kind === "stop") {
    await revokeByReply(db, practiceId, patient.id, now);
    return { result: "stopped", patientId: patient.id };
  }
  if (!target) return { result: "ignored", reason: "no_cadence_message" };
  if (!appointment) return { result: "ignored", reason: "appointment_passed" };

  const cadence = { kind: "cadence" as const, practiceId, db };
  const setStatus = async (to: "CONFIRMED" | "CANCELED_BY_PATIENT") => {
    try {
      await changeAppointmentStatus(cadence, { appointmentId: appointment.id, to, from: appointment.status });
      return true;
    } catch (error) {
      // Already confirmed, closed, or changed meanwhile: the reply stays recorded.
      if (error instanceof AgendaError) return false;
      throw error;
    }
  };

  if (kind === "confirm" && appointment.status === "SCHEDULED" && (await setStatus("CONFIRMED"))) {
    return { result: "confirmed", appointmentId: appointment.id };
  }
  if (kind === "cancel" && (await setStatus("CANCELED_BY_PATIENT"))) return { result: "canceled", appointmentId: appointment.id };
  if (kind === "reschedule" && appointment.status !== "RESCHEDULED") {
    await openFlag(db, practiceId, appointment.id, "RESCHEDULE_REQUESTED", now);
    return { result: "reschedule_requested", appointmentId: appointment.id };
  }
  if (kind === "free_text" && appointment.status === "SCHEDULED") {
    await openFlag(db, practiceId, appointment.id, "REPLIED_WITHOUT_CONFIRMING", now);
    return { result: "free_text", appointmentId: appointment.id };
  }
  return { result: "recorded", appointmentId: appointment.id };
}

async function openFlag(db: PracticeScopedClient, practiceId: string, appointmentId: string, type: AppointmentFlagType, now: Date) {
  await db.$transaction(async (tx) => {
    const open = await tx.appointmentFlag.count({ where: { appointmentId, type, resolvedAt: null } });
    if (open > 0) return;
    await tx.appointmentFlag.create({ data: { practiceId, appointmentId, type, createdAt: now } });
    await audit(tx, practiceId, "appointment.flagged", "Appointment", appointmentId, ["flags"]);
  });
}

/** PARAR (PRD 6, rule 1): a new revocation row, channel WhatsApp, and the cadence stops. */
async function revokeByReply(db: PracticeScopedClient, practiceId: string, patientId: string, now: Date) {
  await db.$transaction(async (tx) => {
    if (!(await hasGrantedConsent(tx, patientId))) return;
    const consent = await tx.contactConsent.create({ data: { practiceId, patientId, granted: false, channel: "WHATSAPP", recordedAt: now } });
    await audit(tx, practiceId, "contact_consent.recorded", "ContactConsent", consent.id, ["granted", "channel"]);
    await applyConsentToCadence(tx, patientId, false, now);
  });
}

function audit(tx: PracticeTransaction, practiceId: string, action: string, entityType: string, entityId: string, changedFields: string[]) {
  return tx.auditEvent.create({ data: { practiceId, actorType: "PATIENT", action, entityType, entityId, changedFields } });
}
