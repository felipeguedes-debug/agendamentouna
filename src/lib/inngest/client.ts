import { Inngest } from "inngest";
import { keepAliveAfterResponse } from "@/lib/after-response";

/**
 * Inngest runs the cadence queue (PRD 12: "Jobs e filas"). In development it talks
 * to the local dev server (`npm run inngest:dev`, INNGEST_DEV=1 in .env), with no
 * account; in production it needs INNGEST_EVENT_KEY and INNGEST_SIGNING_KEY.
 */
export const inngest = new Inngest({ id: "agenda-consultorios" });

/**
 * Sends an event without holding up whoever asked (D-92): each event here is only a nudge,
 * because a tick or a polling finds the work anyway. When Inngest is out of reach, its
 * client retries for about 2 s, and no screen should wait for that.
 */
export function sendWithoutWaiting(event: Parameters<typeof inngest.send>[0], whenUnreachable: string) {
  const sending = Promise.resolve(inngest.send(event)).catch((error: unknown) => console.warn(whenUnreachable, (error as Error).message));
  keepAliveAfterResponse(sending);
}

export type JobEvent = { name: string; data: Record<string, unknown> };

/**
 * A job asking for other jobs (D-100). Here the send is part of the work: when it fails, the
 * run fails and Inngest tries it again. It costs no step. A screen uses sendWithoutWaiting.
 */
export function sendFromJob(events: JobEvent[]) {
  return inngest.send(events);
}

/** Drains one instance's due dispatches. */
export const DRAIN_INSTANCE_EVENT = "cadence/instance.drain";

/**
 * Asks Inngest to drain an instance now (a manual dispatch, a reconnection) instead
 * of waiting for the next minute's tick. Not reaching Inngest is not an error: the
 * tick will find the dispatch.
 */
export async function requestDrain(practiceId: string, instanceId: string) {
  sendWithoutWaiting({ name: DRAIN_INSTANCE_EVENT, data: { practiceId, instanceId } }, `Inngest unreachable; the next tick sends instance ${instanceId}'s queue`);
}
