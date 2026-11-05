import type { PracticeTransaction } from "@/lib/db";
import { sendWithoutWaiting } from "@/lib/inngest/client";

/**
 * The queue of confirmation notices (D-78), small so the appointment services can use it
 * without loading the push client: the transaction that confirms marks the appointment,
 * and after the commit Inngest is asked to send now; the minute tick picks up what it
 * misses. Nothing here ever fails a confirmation.
 */

export const PUSH_CONFIRMATIONS_EVENT = "push/practice.confirmations";

/** Only when someone can hear it, and not the person who just confirmed. */
export async function markForConfirmationPush(tx: PracticeTransaction, appointmentId: string, actorUserId: string | null, now: Date) {
  await tx.appointment.updateMany({
    where: {
      id: appointmentId,
      startsAt: { gt: now },
      professional: { is: { userId: actorUserId ? { not: actorUserId } : { not: null } } },
    },
    data: { pushRequestedAt: now },
  });
}

/** Not reaching Inngest is not an error: the minute tick finds the mark. */
export async function requestConfirmationPush(practiceId: string) {
  sendWithoutWaiting({ name: PUSH_CONFIRMATIONS_EVENT, data: { practiceId } }, `Inngest unreachable; the next tick sends practice ${practiceId}'s confirmation notices`);
}
