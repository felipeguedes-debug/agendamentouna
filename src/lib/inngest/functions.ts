import { INSTANCE_INTERVAL_MS, sendNextDueAndPeek } from "@/lib/cadence/sender";
import { applyContactCommands } from "@/lib/crm/inbound";
import { practicesWithCrm } from "@/lib/crm/jobs";
import { exportToCrm } from "@/lib/crm/outbound";
import { CRM_CONTACT_CHECK_EVENT, CRM_EXPORT_EVENT, CRM_RECONCILE_EVENT } from "@/lib/crm/queue";
import { reconcileNextDay } from "@/lib/crm/reconcile";
import { activeConnectionIds, dailyGoogleUpkeep, runConnectionSync, syncGoogleCalendar } from "@/lib/google/jobs";
import { exportAppointments } from "@/lib/google/outbound";
import { GOOGLE_CALENDAR_CHANGED_EVENT, GOOGLE_CONNECTION_SYNC_EVENT, GOOGLE_EXPORT_EVENT } from "@/lib/google/queue";
import { pruneServerErrors, recordJobFailure } from "@/lib/observability/errors";
import { sendConfirmationPushes } from "@/lib/push/notify";
import { PUSH_CONFIRMATIONS_EVENT } from "@/lib/push/queue";
import { pruneExpiredSubscriptions } from "@/lib/push/subscriptions";
import { DRAIN_INSTANCE_EVENT, inngest, sendFromJob } from "./client";
import { runMinuteTick } from "./tick";

/**
 * The background jobs. Thin wrappers: the rules live in src/lib/cadence, src/lib/google,
 * src/lib/crm and src/lib/push, and are tested there.
 *
 * Inngest counts each run and each step (D-100). A function with one piece of work has no
 * step: it would double the count and retry the same thing. Only the drain has steps, the
 * ones that hold the 8 s between messages. What looks for work on a schedule is one run a
 * minute, in ./tick.ts.
 */

export const minuteTick = inngest.createFunction(
  // The next minute finds whatever a failure left, so a long series of retries is no use.
  { id: "minute-tick", retries: 1, triggers: [{ cron: "* * * * *" }] },
  () => runMinuteTick(),
);

/**
 * The cadence queue (PRD 6, D-07, D-09). A drain sends one instance's due dispatches one at
 * a time, 8 s apart; Inngest runs at most one drain per instance, so two runs never interleave.
 */

/** 60 s of sends at one per 8 s; the next tick takes the rest. */
const SENDS_PER_DRAIN = 8;

export const drainInstance = inngest.createFunction(
  { id: "cadence-drain-instance", triggers: [{ event: DRAIN_INSTANCE_EVENT }], concurrency: { key: "event.data.instanceId", limit: 1 } },
  async ({ event, step }) => {
    const { practiceId, instanceId } = event.data as { practiceId: string; instanceId: string };
    let sent = 0;
    for (let index = 0; index < SENDS_PER_DRAIN * 3; index += 1) {
      const outcome = await step.run(`send-${index}`, () => sendNextDueAndPeek(practiceId, instanceId));
      if (outcome.result === "idle" || outcome.result === "held") break;
      if (outcome.result === "wait") await step.sleep(`wait-${index}`, Math.max(outcome.waitMs, 1_000));
      if (outcome.result === "sent") {
        sent += 1;
        // With nothing else due there is no one to wait 8 s for, and no step to spend.
        if (sent >= SENDS_PER_DRAIN || !outcome.more) break;
        await step.sleep(`interval-${index}`, INSTANCE_INTERVAL_MS);
      }
    }
    return { sent };
  },
);

/**
 * Google Agenda (Block 6, D-61, D-62). An export event (a booking, a status change) exports
 * the practice's marked appointments at once, one run per practice. A push reads its calendar,
 * debounced for 5 s. Runs of the same connection never overlap (the env-scoped concurrency
 * key). Once a day: calendar lists, push channels about to expire, erased patients' events,
 * and a full read of every connection.
 */

const ONE_PER_CONNECTION = { key: "event.data.connectionId", limit: 1, scope: "env" } as const;

export const googleExport = inngest.createFunction(
  { id: "google-export", triggers: [{ event: GOOGLE_EXPORT_EVENT }], concurrency: { key: "event.data.practiceId", limit: 1 } },
  ({ event }) => {
    const { practiceId, appointmentIds } = event.data as { practiceId: string; appointmentIds?: string[] };
    return exportAppointments(practiceId, { appointmentIds });
  },
);

export const googleCalendarChanged = inngest.createFunction(
  {
    id: "google-calendar-changed",
    triggers: [{ event: GOOGLE_CALENDAR_CHANGED_EVENT }],
    debounce: { key: "event.data.calendarId", period: "5s" },
    concurrency: ONE_PER_CONNECTION,
  },
  ({ event }) => syncGoogleCalendar((event.data as { calendarId: string }).calendarId),
);

export const googleConnectionSync = inngest.createFunction(
  { id: "google-connection-sync", triggers: [{ event: GOOGLE_CONNECTION_SYNC_EVENT }], concurrency: ONE_PER_CONNECTION },
  ({ event }) => {
    const { connectionId, full } = event.data as { connectionId: string; full?: boolean };
    return runConnectionSync(connectionId, { full });
  },
);

// 06:00 UTC, 03:00 in Fortaleza: out of office hours.
export const googleDaily = inngest.createFunction({ id: "google-daily", triggers: [{ cron: "0 6 * * *" }] }, async () => {
  const marked = await dailyGoogleUpkeep();
  const connections = await activeConnectionIds();
  if (connections.length > 0) await sendFromJob(connections.map((connectionId) => ({ name: GOOGLE_CONNECTION_SYNC_EVENT, data: { connectionId, full: true } })));
  return { marked, connections: connections.length };
});

/**
 * SynkronosCRM (Block 7, D-68, D-69). An export event exports what is due in the practice.
 * Runs of one account never overlap, however many practices share it, since the rate limit
 * is the account's (D-73). A contact whose read failed during the webhook is read again, with
 * Inngest's own retries for a CRM still down. Once a day, before the D-1 messages of the
 * evening, the next day is reconciled.
 */

const ONE_PER_CRM_ACCOUNT = { key: "event.data.accountId", limit: 1, scope: "env" } as const;

export const crmExport = inngest.createFunction({ id: "crm-export", triggers: [{ event: CRM_EXPORT_EVENT }], concurrency: ONE_PER_CRM_ACCOUNT }, ({ event }) => exportToCrm((event.data as { practiceId: string }).practiceId));

export const crmContactCheck = inngest.createFunction({ id: "crm-contact-check", triggers: [{ event: CRM_CONTACT_CHECK_EVENT }], concurrency: ONE_PER_CRM_ACCOUNT }, ({ event }) => {
  const { accountId, contactId } = event.data as { accountId: string; contactId: string };
  return applyContactCommands(accountId, { contactId, origin: "retry" });
});

export const crmReconcile = inngest.createFunction({ id: "crm-reconcile", triggers: [{ event: CRM_RECONCILE_EVENT }], concurrency: ONE_PER_CRM_ACCOUNT }, ({ event }) => reconcileNextDay((event.data as { practiceId: string }).practiceId));

// 20:00 UTC, 17:00 in Fortaleza: an hour before the D-1 messages at 18:00.
export const crmDaily = inngest.createFunction({ id: "crm-daily", triggers: [{ cron: "0 20 * * *" }] }, async () => {
  const practices = await practicesWithCrm();
  if (practices.length > 0) await sendFromJob(practices.map((data) => ({ name: CRM_RECONCILE_EVENT, data })));
  return { practices: practices.length };
});

/**
 * Confirmation notices of the professional's PWA (Block 8, D-78). The rules live in
 * src/lib/push. A confirmation asks for its practice's notices at once.
 */
export const pushConfirmations = inngest.createFunction({ id: "push-confirmations", triggers: [{ event: PUSH_CONFIRMATIONS_EVENT }], concurrency: { key: "event.data.practiceId", limit: 1 } }, ({ event }) =>
  sendConfirmationPushes((event.data as { practiceId: string }).practiceId),
);

/** Once a day: subscriptions of sessions that ended by time (D-78) and old server errors (D-101). */
export const dailyCleanup = inngest.createFunction({ id: "daily-cleanup", triggers: [{ cron: "0 7 * * *" }] }, async () => ({
  subscriptions: await pruneExpiredSubscriptions(),
  serverErrors: await pruneServerErrors(),
}));

/**
 * A job that gave up after its retries goes on the panel of the practice it was working for
 * (D-101). Inngest's own event, which costs one execution and only when something failed.
 */
export const jobFailureRecorder = inngest.createFunction({ id: "job-failure-recorder", retries: 0, triggers: [{ event: "inngest/function.failed" }] }, ({ event }) => recordJobFailure(event.data as Parameters<typeof recordJobFailure>[0]));

export const functions = [
  minuteTick,
  drainInstance,
  googleExport,
  googleCalendarChanged,
  googleConnectionSync,
  googleDaily,
  crmExport,
  crmContactCheck,
  crmReconcile,
  crmDaily,
  pushConfirmations,
  dailyCleanup,
  jobFailureRecorder,
];
