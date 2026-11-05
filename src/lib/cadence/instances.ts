import type { WhatsappInstanceStatus } from "@/generated/prisma/enums";
import { formatDateBr, formatTime, toZoned } from "@/lib/dates/zoned";
import { forPractice } from "@/lib/db";
import { getEmailSender, type EmailSender } from "@/lib/email/sender";
import type { InstanceConnection } from "@/lib/messaging";

/**
 * Connection of the WhatsAPI instances (PRD 6 rule 8, D-09). While an instance is
 * not connected its dispatches wait in the queue. When it comes back, the overdue
 * ones go only if they are less than 2 h late and the appointment is still ahead;
 * the others fail with "instância desconectada". Losing the connection emails the
 * practice's managers and the professional.
 */

export const RECONNECT_GRACE_MS = 2 * 3_600_000;

const STATUS_OF: Record<InstanceConnection, WhatsappInstanceStatus> = {
  connected: "CONNECTED",
  connecting: "PENDING_QR",
  disconnected: "DISCONNECTED",
};

/** Records the instance's connection; returns the new status when it changed. */
export async function setInstanceConnection(
  practiceId: string,
  instanceId: string,
  connection: InstanceConnection,
  now: Date,
  deps: { emailSender?: EmailSender } = {},
) {
  const db = forPractice(practiceId);
  const status = STATUS_OF[connection];
  const instance = await db.whatsappInstance.findFirst({ where: { id: instanceId }, select: { status: true } });
  if (!instance || instance.status === status) return null;
  const { count } = await db.whatsappInstance.updateMany({ where: { id: instanceId, status: instance.status }, data: { status, statusChangedAt: now } });
  if (count === 0) return null;

  if (status === "CONNECTED") await releaseQueueOnReconnect(practiceId, instanceId, now);
  if (instance.status === "CONNECTED" && status !== "CONNECTED") {
    try {
      await alertDisconnection(practiceId, instanceId, now, deps.emailSender ?? getEmailSender());
    } catch (error) {
      console.error("Could not send the disconnection alert", error);
    }
  }
  return status;
}

/** D-09: overdue dispatches that are 2 h late or whose appointment has passed fail. */
export async function releaseQueueOnReconnect(practiceId: string, instanceId: string, now: Date) {
  const { count } = await forPractice(practiceId).dispatch.updateMany({
    where: {
      whatsappInstanceId: instanceId,
      status: "SCHEDULED",
      scheduledFor: { lte: now },
      OR: [{ scheduledFor: { lte: new Date(now.getTime() - RECONNECT_GRACE_MS) } }, { appointment: { startsAt: { lte: now } } }],
    },
    data: { status: "FAILED", statusReason: "instance_disconnected", lockedUntil: null },
  });
  return count;
}

async function alertDisconnection(practiceId: string, instanceId: string, now: Date, emailSender: EmailSender) {
  const db = forPractice(practiceId);
  const instance = await db.whatsappInstance.findFirstOrThrow({
    where: { id: instanceId },
    select: { phoneNumber: true, professional: { select: { name: true, userId: true } } },
  });
  const managers = await db.membership.findMany({ where: { role: "PRACTICE_MANAGER", revokedAt: null }, select: { userId: true } });
  const userIds = [...new Set([...managers.map((row) => row.userId), ...(instance.professional.userId ? [instance.professional.userId] : [])])];
  const recipients = await db.user.findMany({ where: { id: { in: userIds } }, select: { email: true } });
  const practice = await db.practice.findFirstOrThrow({ select: { name: true, locations: { where: { active: true }, select: { timeZone: true }, take: 1 } } });
  const timeZone = practice.locations[0]?.timeZone ?? "America/Fortaleza";
  const when = `${formatDateBr(toZoned(now, timeZone).date)} às ${formatTime(now, timeZone)}`;
  for (const recipient of recipients) {
    await emailSender.send({
      to: recipient.email,
      subject: `WhatsApp desconectado: ${instance.professional.name}`,
      text: [
        `O WhatsApp de ${instance.professional.name} (${practice.name}) desconectou em ${when}.`,
        "Os lembretes da régua ficam na fila. Ao reconectar, saem só os que venceram há menos de 2 horas; os outros ficam no log como falhou.",
        "Reconecte a instância pelo QR Code no painel da WhatsAPI.",
      ].join("\n\n"),
    });
  }
}
