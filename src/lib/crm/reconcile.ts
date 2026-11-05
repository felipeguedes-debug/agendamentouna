import { addDays, todayIn, zonedToUtc } from "@/lib/dates/zoned";
import { forPractice, type PracticeScopedClient } from "@/lib/db";
import { appointmentsOfContact, crmAccountOf, markCrmRevoked, practicesOfAccount } from "./account";
import { crmProviderFor, type CrmSyncOptions } from "./index";
import { applyCommandsOf } from "./inbound";
import { isCrmError, type CrmContact, type CrmSync } from "./provider";
import { markForCrmSync, requestCrmSync } from "./queue";
import { sameTag, statusTagOf, statusTagsIn } from "./rules";

/**
 * The daily reconciliation (PRD 10, status divergente; D-69). Before the D-1 messages
 * of the evening, each patient with an appointment on the next day, in the location's
 * zone, has the contact read from the CRM:
 *
 * - a command still on the contact is applied: its webhook got lost, or the CRM was
 *   down, and the cadence would go on asking;
 * - a status tag that differs from the agenda's, or no contact at all, marks the
 *   appointments for export. The agenda is the source of the status, and the export
 *   writes no second note (crmSyncedStatus).
 *
 * Only commands change the agenda; a status tag someone changed by hand does not. The
 * tag is compared across the practices of the account, as the export writes it (D-73).
 */

export type ReconcileSummary = { checked: number; commands: number; diverged: number; unavailable: boolean };

const WAITING_STATUSES = ["SCHEDULED", "CONFIRMED"] as const;

async function nextDayAppointments(db: PracticeScopedClient, now: Date) {
  const locations = await db.location.findMany({ select: { id: true, timeZone: true } });
  const windows = locations.map((location) => {
    const tomorrow = addDays(todayIn(location.timeZone, now), 1);
    return { locationId: location.id, startsAt: { gte: zonedToUtc(tomorrow, "00:00", location.timeZone), lt: zonedToUtc(addDays(tomorrow, 1), "00:00", location.timeZone) } };
  });
  if (windows.length === 0) return [];
  return db.appointment.findMany({
    where: { status: { in: [...WAITING_STATUSES] }, OR: windows },
    select: { id: true, patient: { select: { id: true, phone: true, crmContactId: true, anonymizedAt: true } } },
  });
}

async function readContact(crm: CrmSync, patient: { phone: string | null; crmContactId: string | null }) {
  const linked = patient.crmContactId ? await crm.getContact(patient.crmContactId) : null;
  if (linked) return linked;
  return patient.phone ? crm.findContactByPhone(patient.phone) : null;
}

async function tagDiverges(practiceIds: readonly string[], contact: CrmContact, now: Date) {
  const expected = statusTagOf(await appointmentsOfContact(practiceIds, contact), now);
  const present = statusTagsIn(contact.tags);
  return expected ? present.length !== 1 || !sameTag(present[0], expected) : false;
}

export async function reconcileNextDay(practiceId: string, options: CrmSyncOptions = {}): Promise<ReconcileSummary> {
  const now = options.now ?? new Date();
  const db = forPractice(practiceId);
  const summary: ReconcileSummary = { checked: 0, commands: 0, diverged: 0, unavailable: false };
  const account = await crmAccountOf(db);
  if (!account || account.status !== "ACTIVE") return summary;
  const crm = options.provider ?? crmProviderFor(account);
  const practiceIds = await practicesOfAccount(account.id);

  const byPatient = new Map<string, { patient: { id: string; phone: string | null; crmContactId: string | null }; appointmentIds: string[] }>();
  for (const row of await nextDayAppointments(db, now)) {
    if (row.patient.anonymizedAt) continue;
    const entry = byPatient.get(row.patient.id) ?? { patient: row.patient, appointmentIds: [] };
    entry.appointmentIds.push(row.id);
    byPatient.set(row.patient.id, entry);
  }

  for (const { patient, appointmentIds } of byPatient.values()) {
    summary.checked += 1;
    try {
      const contact = await readContact(crm, patient);
      if (!contact) {
        if (patient.phone) {
          await markForCrmSync(db, appointmentIds, now);
          summary.diverged += 1;
        }
        continue;
      }
      const results = await applyCommandsOf(account, crm, contact, { origin: "reconciliation" }, now);
      summary.commands += results.length;
      if (await tagDiverges(practiceIds, contact, now)) {
        await markForCrmSync(db, appointmentIds, now);
        summary.diverged += 1;
      }
    } catch (error) {
      if (!isCrmError(error)) throw error;
      // One contact the CRM refuses does not stop the others.
      if (error.kind === "rejected" || error.kind === "not_found") continue;
      summary.unavailable = true;
      if (error.kind === "auth") await markCrmRevoked(account.id, error.message, now);
      else console.warn(`CRM reconciliation of practice ${practiceId} stopped: ${error.message}`);
      return summary;
    }
  }

  await db.crmConnection.updateMany({ data: { reconciledAt: now } });
  if (summary.diverged > 0) await requestCrmSync(practiceId, db);
  return summary;
}
