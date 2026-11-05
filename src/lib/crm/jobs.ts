import { prisma } from "@/lib/db";

/**
 * The CRM work across practices, for the Inngest functions (src/lib/inngest). They read
 * the queue and the connections through the base client, since they run for the whole
 * system; each practice's rows are then handled through its scoped client. Each row
 * comes with its account, the key that keeps runs of one account from overlapping (D-73).
 */

const ACTIVE_CONNECTION = { crmAccount: { is: { status: "ACTIVE" as const } } };

/** Practices with something due for the CRM, on an active account (the minute tick). */
export async function practicesToSyncCrm(now = new Date()) {
  const active = { practice: { is: { crmConnection: { is: ACTIVE_CONNECTION } } } };
  const dueNow = { OR: [{ crmSyncRetryAt: null }, { crmSyncRetryAt: { lte: now } }] };
  // Base client: the sweep looks at every practice's queue.
  const [appointments, patients] = await Promise.all([
    prisma.appointment.groupBy({ by: ["practiceId"], where: { ...active, ...dueNow, crmSyncRequestedAt: { not: null } } }),
    prisma.patient.groupBy({ by: ["practiceId"], where: { ...active, AND: [dueNow, { OR: [{ crmSyncRequestedAt: { not: null } }, { crmEraseRequestedAt: { not: null } }] }] } }),
  ]);
  const practiceIds = [...new Set([...appointments, ...patients].map((row) => row.practiceId))];
  if (practiceIds.length === 0) return [];
  const connections = await prisma.crmConnection.findMany({ where: { practiceId: { in: practiceIds } }, select: { practiceId: true, crmAccountId: true } });
  return connections.map(({ practiceId, crmAccountId }) => ({ practiceId, accountId: crmAccountId }));
}

/** Practices on an active account (the daily reconciliation). */
export async function practicesWithCrm() {
  // Base client: the sweep looks at every practice's connection.
  const connections = await prisma.crmConnection.findMany({ where: ACTIVE_CONNECTION, select: { practiceId: true, crmAccountId: true } });
  return connections.map(({ practiceId, crmAccountId }) => ({ practiceId, accountId: crmAccountId }));
}
