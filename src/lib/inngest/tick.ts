import { checkInstanceConnections, instancesWithDueDispatches } from "@/lib/cadence/queue";
import { practicesToSyncCrm } from "@/lib/crm/jobs";
import { CRM_EXPORT_EVENT } from "@/lib/crm/queue";
import { activeConnectionIds, practicesToExport } from "@/lib/google/jobs";
import { GOOGLE_CONNECTION_SYNC_EVENT, GOOGLE_EXPORT_EVENT } from "@/lib/google/queue";
import { practicesWithPendingPush } from "@/lib/push/notify";
import { PUSH_CONFIRMATIONS_EVENT } from "@/lib/push/queue";
import { DRAIN_INSTANCE_EVENT, sendFromJob, type JobEvent } from "./client";

/**
 * Everything that looks for work on a schedule, in one run a minute (D-100). Inngest counts
 * each run and each step, so this used to be 5 functions with a step each; the system standing
 * still spent 385 thousand executions a month. Run by run, the same queues are read as often:
 *
 * - every minute, the cadence's due dispatches and what events missed for Google, the CRM and
 *   the notices (D-54, D-62, D-68, D-78);
 * - every 4 minutes, a read of each Google connection, for the 5 minutes of PRD 7 (D-61);
 * - every 5 minutes, each instance's connection (D-54).
 */

const GOOGLE_POLL_MINUTES = 4;
const INSTANCE_CHECK_MINUTES = 5;

export type TickSources = {
  dueInstances: () => Promise<{ practiceId: string; instanceId: string }[]>;
  googleExports: () => Promise<string[]>;
  crmExports: () => Promise<{ practiceId: string; accountId: string }[]>;
  pendingPushes: () => Promise<{ practiceId: string }[]>;
  googleConnections: () => Promise<string[]>;
  checkInstances: () => Promise<number>;
};

const REAL_SOURCES: TickSources = {
  dueInstances: () => instancesWithDueDispatches(),
  googleExports: () => practicesToExport(),
  crmExports: () => practicesToSyncCrm(),
  pendingPushes: () => practicesWithPendingPush(),
  googleConnections: () => activeConnectionIds(),
  checkInstances: () => checkInstanceConnections(),
};

function failureOf(reasons: unknown[]) {
  return reasons.length === 1 ? reasons[0] : new AggregateError(reasons, "Several queues of the minute tick failed");
}

export async function runMinuteTick(now = new Date(), deps: { sources?: TickSources; send?: (events: JobEvent[]) => Promise<unknown> } = {}) {
  const { sources = REAL_SOURCES, send = sendFromJob } = deps;
  const minute = now.getUTCMinutes();
  const settled = await Promise.allSettled<JobEvent[]>([
    sources.dueInstances().then((rows) => rows.map((data) => ({ name: DRAIN_INSTANCE_EVENT, data }))),
    sources.googleExports().then((rows) => rows.map((practiceId) => ({ name: GOOGLE_EXPORT_EVENT, data: { practiceId } }))),
    sources.crmExports().then((rows) => rows.map((data) => ({ name: CRM_EXPORT_EVENT, data }))),
    sources.pendingPushes().then((rows) => rows.map((data) => ({ name: PUSH_CONFIRMATIONS_EVENT, data }))),
    minute % GOOGLE_POLL_MINUTES === 0 ? sources.googleConnections().then((rows) => rows.map((connectionId) => ({ name: GOOGLE_CONNECTION_SYNC_EVENT, data: { connectionId } }))) : Promise.resolve([]),
  ]);

  // One queue that fails does not stop the others. The run fails at the end, for the retry.
  const events = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  const failures = settled.flatMap((result) => (result.status === "rejected" ? [result.reason as unknown] : []));
  if (events.length > 0) await send(events);

  // After the send: an instance that does not answer takes up to 15 s, and holds up nothing.
  const checked = minute % INSTANCE_CHECK_MINUTES === 0;
  if (checked) await sources.checkInstances().catch((error: unknown) => failures.push(error));

  if (failures.length > 0) throw failureOf(failures);
  return { events: events.length, checked };
}
