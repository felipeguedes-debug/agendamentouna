import { forPractice, prisma, type PracticeScopedClient, type PracticeTransaction } from "@/lib/db";
import { sendWithoutWaiting } from "@/lib/inngest/client";

/**
 * The export queue to SynkronosCRM (D-68), kept small so the appointment and patient
 * services can use it without loading the CRM client:
 *
 * - inside the transaction that books, changes the status, reschedules, imports or
 *   registers, `markForCrmSync` and `markPatientsForCrmSync` mark the rows, when the
 *   practice has a connection;
 * - after the commit, `requestCrmSync` asks Inngest to export them now; the minute tick
 *   picks up whatever it misses. Nothing here ever fails a booking.
 *
 * Events carry the account, since the rate limit is the account's: runs of one account
 * never overlap, however many practices share it (D-73).
 */

/** Exports the marked rows of one practice (src/lib/inngest/functions.ts). */
export const CRM_EXPORT_EVENT = "crm/practice.export";

/** Reads a contact again and applies its commands, after the CRM failed during the webhook. */
export const CRM_CONTACT_CHECK_EVENT = "crm/contact.check";

/** Reconciles the next day's appointments of one practice (D-69). */
export const CRM_RECONCILE_EVENT = "crm/practice.reconcile";

type Db = PracticeTransaction | PracticeScopedClient;

export const CLEAR_CRM_RETRY = { crmSyncAttempts: 0, crmSyncRetryAt: null, crmSyncError: null };

export async function markForCrmSync(db: Db, appointmentIds: readonly string[], now = new Date()) {
  if (appointmentIds.length === 0 || (await db.crmConnection.count()) === 0) return 0;
  const { count } = await db.appointment.updateMany({ where: { id: { in: [...appointmentIds] } }, data: { crmSyncRequestedAt: now, ...CLEAR_CRM_RETRY } });
  return count;
}

export async function markPatientsForCrmSync(db: Db, patientIds: readonly string[], now = new Date()) {
  if (patientIds.length === 0 || (await db.crmConnection.count()) === 0) return 0;
  const { count } = await db.patient.updateMany({ where: { id: { in: [...patientIds] }, anonymizedAt: null }, data: { crmSyncRequestedAt: now, ...CLEAR_CRM_RETRY } });
  return count;
}

/** Not reaching Inngest is not an error: the minute tick finds the marks. */
export async function requestCrmSync(practiceId: string, db: PracticeScopedClient = forPractice(practiceId)) {
  const connection = await db.crmConnection.findFirst({ select: { crmAccountId: true } });
  if (!connection) return;
  // Base client: the account belongs to no practice (D-73).
  const account = await prisma.crmAccount.findUnique({ where: { id: connection.crmAccountId }, select: { status: true } });
  if (account?.status !== "ACTIVE") return;
  sendWithoutWaiting({ name: CRM_EXPORT_EVENT, data: { practiceId, accountId: connection.crmAccountId } }, `Inngest unreachable; the next tick exports practice ${practiceId} to the CRM`);
}

/** Not reaching Inngest here leaves the command on the contact, for the daily reconciliation (D-69). */
export async function requestContactCheck(accountId: string, contactId: string) {
  sendWithoutWaiting({ name: CRM_CONTACT_CHECK_EVENT, data: { accountId, contactId } }, `Inngest unreachable; the reconciliation reads the contact later`);
}
