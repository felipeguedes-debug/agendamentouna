import { forPractice, type PracticeScopedClient } from "@/lib/db";
import { MessagingError, providerFor, type MessagingProvider } from "@/lib/messaging";
import { setInstanceConnection } from "./instances";
import { CADENCE_APPOINTMENT_STATUSES, hasGrantedConsent, practiceSendWindow, SENT_DISPATCH_STATUSES, type DispatchReason } from "./plan";
import { nextValidTime, RATE_LIMIT_MS } from "./schedule";
import { renderTemplate } from "./template";

/**
 * Sends the due dispatches of one WhatsAPI instance, one at a time (PRD 6; D-06,
 * D-07, D-09). The Inngest drain (src/lib/inngest/functions.ts) calls
 * `sendNextDue` in a loop; tests call it directly.
 *
 * Before sending, everything is checked again, since the plan was made earlier:
 * the appointment is still ahead, its status is eligible for the step, the cadence
 * is on and not paused by a free-text reply, the consent is still "granted", and no
 * automatic message went to the patient in the last 4 h (else the step moves to the
 * end of the interval, within the window and the margin, or is skipped). At least
 * 8 s pass between two messages of the same instance. A disconnected instance keeps
 * its queue (D-09). After the last confirmation request goes (or is skipped) with
 * the appointment still Agendado, the appointment gets the "Sem confirmação" flag.
 */

export const INSTANCE_INTERVAL_MS = 8_000;
export const LEASE_MS = 2 * 60_000;
export const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 60_000;
const OVERDUE_MS = 2 * 3_600_000;

export type SendOutcome =
  | { result: "idle" }
  | { result: "held" }
  | { result: "wait"; waitMs: number }
  | { result: "sent" | "skipped" | "canceled" | "failed" | "postponed" | "retry"; dispatchId: string };

type Deps = { provider?: MessagingProvider };

/**
 * sendNextDue, and whether more is due right after, so the drain does not spend 8 s and two
 * steps of Inngest to find out there is nothing else (D-100).
 */
export async function sendNextDueAndPeek(practiceId: string, instanceId: string, now = new Date(), deps: Deps = {}) {
  const outcome = await sendNextDue(practiceId, instanceId, now, deps);
  if (outcome.result !== "sent") return { ...outcome, more: true };
  const next = await forPractice(practiceId).dispatch.findFirst({ where: { whatsappInstanceId: instanceId, status: "SCHEDULED", scheduledFor: { lte: now } }, select: { id: true } });
  return { ...outcome, more: Boolean(next) };
}

export async function sendNextDue(practiceId: string, instanceId: string, now = new Date(), deps: Deps = {}): Promise<SendOutcome> {
  const db = forPractice(practiceId);
  const instance = await db.whatsappInstance.findFirst({ where: { id: instanceId } });
  if (!instance) return { result: "idle" };

  const due = await db.dispatch.findFirst({
    where: { whatsappInstanceId: instanceId, status: "SCHEDULED", scheduledFor: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (!due) return { result: "idle" };
  if (instance.status !== "CONNECTED") return { result: "held" };

  const lastSent = await db.dispatch.findFirst({
    where: { whatsappInstanceId: instanceId, sentAt: { not: null } },
    orderBy: { sentAt: "desc" },
    select: { sentAt: true },
  });
  const sinceLast = lastSent?.sentAt ? now.getTime() - lastSent.sentAt.getTime() : Infinity;
  if (sinceLast < INSTANCE_INTERVAL_MS) return { result: "wait", waitMs: INSTANCE_INTERVAL_MS - sinceLast };

  // The lease keeps a second sender off this dispatch while the provider answers.
  const { count } = await db.dispatch.updateMany({
    where: { id: due.id, status: "SCHEDULED", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    data: { lockedUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (count === 0) return { result: "wait", waitMs: 0 };

  const dispatch = await db.dispatch.findFirstOrThrow({
    where: { id: due.id },
    include: {
      cadenceStep: { select: { template: true, eligibleStatuses: true, action: true } },
      appointment: {
        select: {
          id: true,
          status: true,
          startsAt: true,
          priceCents: true,
          cadenceEnabled: true,
          patient: { select: { id: true, name: true, phone: true } },
          professional: { select: { name: true } },
          location: { select: { address: true, timeZone: true } },
          appointmentType: { select: { displayName: true, category: true, preparation: true } },
          flags: { where: { resolvedAt: null, type: "REPLIED_WITHOUT_CONFIRMING" }, select: { id: true } },
        },
      },
    },
  });
  const { appointment, cadenceStep: step } = dispatch;
  const finish = async (status: "SKIPPED" | "CANCELED" | "FAILED", reason: DispatchReason) => {
    await db.dispatch.update({ where: { id: dispatch.id }, data: { status, statusReason: reason, lockedUntil: null } });
    if (step?.action === "REQUEST_CONFIRMATION") await flagUnconfirmedIfLastRequest(db, practiceId, appointment.id, now);
    return { result: status === "SKIPPED" ? "skipped" : status === "CANCELED" ? "canceled" : "failed", dispatchId: dispatch.id } as const;
  };

  if (appointment.startsAt <= now) return finish("SKIPPED", "appointment_passed");
  if (now.getTime() - dispatch.scheduledFor.getTime() >= OVERDUE_MS) {
    // Late because the instance was away (D-09), or because nothing drained the queue.
    return finish("FAILED", instance.statusChangedAt > dispatch.scheduledFor ? "instance_disconnected" : "overdue");
  }
  if (!(CADENCE_APPOINTMENT_STATUSES as readonly string[]).includes(appointment.status)) return finish("CANCELED", "not_eligible");
  if (!dispatch.manual) {
    if (!appointment.cadenceEnabled) return finish("CANCELED", "cadence_off");
    if (step && !step.eligibleStatuses.includes(appointment.status)) return finish("CANCELED", "not_eligible");
  }
  if (!(await hasGrantedConsent(db, appointment.patient.id))) return finish("CANCELED", "no_consent");
  if (!appointment.patient.phone) return finish("FAILED", "no_phone");
  if (!step) return finish("FAILED", "send_error");

  if (!dispatch.manual) {
    if (appointment.flags.length > 0) return finish("SKIPPED", "paused");
    const recent = await db.dispatch.findFirst({
      where: {
        id: { not: dispatch.id },
        manual: false,
        appointment: { patientId: appointment.patient.id },
        sentAt: { gt: new Date(now.getTime() - RATE_LIMIT_MS) },
      },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    });
    if (recent?.sentAt) {
      // D-07: postponed to the end of the 4 h, within the window and the margin.
      const { window, marginMinutes } = await practiceSendWindow(db);
      const at = nextValidTime(new Date(recent.sentAt.getTime() + RATE_LIMIT_MS), appointment.location.timeZone, window);
      if (!at || at.getTime() > appointment.startsAt.getTime() - marginMinutes * 60_000) return finish("SKIPPED", "rate_limit");
      await db.dispatch.update({ where: { id: dispatch.id }, data: { scheduledFor: at, statusReason: "rate_limited", lockedUntil: null } });
      return { result: "postponed", dispatchId: dispatch.id };
    }
  }

  const text = renderTemplate(step.template, {
    patientName: appointment.patient.name,
    professionalName: appointment.professional.name,
    type: appointment.appointmentType,
    startsAt: appointment.startsAt,
    timeZone: appointment.location.timeZone,
    address: appointment.location.address,
    priceCents: appointment.priceCents,
  });
  const provider = deps.provider ?? providerFor(instance);
  try {
    const { providerMessageId } = await provider.sendText({ to: appointment.patient.phone, text, trackId: dispatch.id });
    await db.dispatch.update({
      where: { id: dispatch.id },
      data: { status: "SENT", sentAt: now, messageText: text, providerMessageId, attempts: { increment: 1 }, lockedUntil: null },
    });
  } catch (error) {
    if (!(error instanceof MessagingError)) throw error;
    if (error.kind === "disconnected") {
      await db.dispatch.update({ where: { id: dispatch.id }, data: { lockedUntil: null } });
      await setInstanceConnection(practiceId, instanceId, "disconnected", now);
      return { result: "held" };
    }
    const attempts = dispatch.attempts + 1;
    if (error.kind === "rejected" || attempts >= MAX_ATTEMPTS) {
      console.error(`Dispatch ${dispatch.id} failed: ${error.message}`);
      await db.dispatch.update({ where: { id: dispatch.id }, data: { attempts } });
      return finish("FAILED", "send_error");
    }
    await db.dispatch.update({ where: { id: dispatch.id }, data: { attempts, lockedUntil: new Date(now.getTime() + RETRY_DELAY_MS) } });
    return { result: "retry", dispatchId: dispatch.id };
  }
  if (step.action === "REQUEST_CONFIRMATION") await flagUnconfirmedIfLastRequest(db, practiceId, appointment.id, now);
  return { result: "sent", dispatchId: dispatch.id };
}

/**
 * "Sem resposta até o último passo" (PRD 6): once no confirmation request is left
 * in the queue and the appointment is still Agendado, it goes to the Sem
 * confirmação list for a phone call.
 */
async function flagUnconfirmedIfLastRequest(db: PracticeScopedClient, practiceId: string, appointmentId: string, now: Date) {
  const appointment = await db.appointment.findFirst({ where: { id: appointmentId }, select: { status: true } });
  if (appointment?.status !== "SCHEDULED") return;
  const pending = await db.dispatch.count({ where: { appointmentId, status: "SCHEDULED", cadenceStep: { is: { action: "REQUEST_CONFIRMATION" } } } });
  if (pending > 0) return;
  const open = await db.appointmentFlag.count({ where: { appointmentId, type: "NO_CONFIRMATION", resolvedAt: null } });
  if (open > 0) return;
  const answered = await db.dispatch.count({ where: { appointmentId, repliedAt: { not: null }, status: { in: [...SENT_DISPATCH_STATUSES] } } });
  if (answered > 0) return;
  await db.appointmentFlag.create({ data: { practiceId, appointmentId, type: "NO_CONFIRMATION", createdAt: now } });
}
