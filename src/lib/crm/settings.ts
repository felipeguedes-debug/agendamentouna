import { AgendaError } from "@/lib/agenda/errors";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { crmAccountOf, practicesOfAccount } from "./account";
import { CLEAR_CRM_RETRY, requestCrmSync } from "./queue";

/**
 * What the Configurações screen shows of the CRM (PRD 11, D-68): the situation, what
 * waits or failed, and the latest commands. The token and the webhook secret never leave
 * the server, not even encrypted. Of a shared account, a practice sees only how many
 * others are on it (D-73), and only its own rows.
 */

export type CrmStatus = "none" | "active" | "revoked";
export type CrmWebhookStatus = "none" | "registered" | "no_public_url";

const RECENT_EVENTS = 10;

function assertManages({ access }: PracticeContext) {
  if (!can(access.role, "practice-settings:edit")) throw new AgendaError("not_allowed", "Only the manager sees the CRM connection");
}

export async function getCrmSettings(context: PracticeContext) {
  assertManages(context);
  const { db } = context;
  const account = await crmAccountOf(db);
  if (!account) return { status: "none" as CrmStatus, webhook: "none" as CrmWebhookStatus, since: null, lastError: null, reconciledAt: null, waiting: 0, failed: 0, sharedWith: 0, recent: [] };

  const [connection, practices, patientsWaiting, appointmentsWaiting, patientsFailed, appointmentsFailed, recent] = await Promise.all([
    db.crmConnection.findFirst({ select: { reconciledAt: true } }),
    practicesOfAccount(account.id),
    db.patient.count({ where: { crmSyncRequestedAt: { not: null } } }),
    db.appointment.count({ where: { crmSyncRequestedAt: { not: null } } }),
    db.patient.count({ where: { crmSyncError: { not: null } } }),
    db.appointment.count({ where: { crmSyncError: { not: null } } }),
    db.crmInboundEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_EVENTS,
      select: { id: true, command: true, outcome: true, origin: true, appointmentId: true, createdAt: true, patient: { select: { name: true } } },
    }),
  ]);
  return {
    status: (account.status === "ACTIVE" ? "active" : "revoked") as CrmStatus,
    webhook: (account.subscriptionId ? "registered" : "no_public_url") as CrmWebhookStatus,
    since: account.statusChangedAt,
    lastError: account.lastError,
    reconciledAt: connection?.reconciledAt ?? null,
    waiting: patientsWaiting + appointmentsWaiting,
    failed: patientsFailed + appointmentsFailed,
    sharedWith: practices.length - 1,
    recent: recent.map((event) => ({ ...event, patientName: event.patient?.name ?? null })),
  };
}

/** "Tentar de novo": what gave up goes back to the queue. */
export async function retryFailedCrmExports(context: PracticeContext, now = new Date()) {
  assertManages(context);
  const { db, access } = context;
  const data = { crmSyncRequestedAt: now, ...CLEAR_CRM_RETRY };
  await db.$transaction(async (tx) => {
    await tx.patient.updateMany({ where: { crmSyncError: { not: null }, crmEraseRequestedAt: null }, data });
    await tx.appointment.updateMany({ where: { crmSyncError: { not: null } }, data });
  });
  await requestCrmSync(access.practiceId, db);
}
