import { forPractice, type PracticeScopedClient } from "@/lib/db";
import { appointmentTypeDisplayName } from "@/lib/domain/labels";
import { appointmentsOfContact, crmAccountOf, markCrmRevoked, practicesOfAccount } from "./account";
import { crmProviderFor, type CrmSyncOptions } from "./index";
import { isCrmError, type CrmContactRef, type CrmError, type CrmSync } from "./provider";
import { CLEAR_CRM_RETRY } from "./queue";
import { ALL_STATUS_TAGS, CRM_COMMAND_TAGS, isCrmSyncedStatus, statusNote, statusTagOf } from "./rules";

/**
 * System → SynkronosCRM (PRD 6; D-14, D-28, D-68, D-73): each marked patient gets a
 * contact created or linked, and each marked appointment a status tag on the contact and
 * a note in the conversation with the professional's number.
 *
 * - An account may be shared by practices, so a contact is never renamed, the tag looks
 *   at the patient's appointments in all of them, and a note only ever goes to the
 *   conversation with the appointment's own number: the latest conversation of the
 *   contact may be another practice's.
 * - A note goes once per status (crmSyncedStatus), so an export that repeats, or a
 *   reconciliation that only fixes the tag, writes no second note.
 * - The mark is cleared only if it is still the one read, so a change made during the
 *   export is exported next time.
 * - An appointment already past that never reached the CRM stays out, as in Google
 *   (D-62): importing a sheet does not fill the conversations with old visits.
 * - "auth" marks the account as revoked and leaves the marks; "rate_limited" stops the
 *   run for the next tick; "transient" comes back with growing waits, up to
 *   EXPORT_MAX_ATTEMPTS; the rest is recorded in crmSyncError and stops.
 * - The erasure (D-28) takes back what the agenda wrote: its notes and tags.
 */

/** With the waits below, about two hours; the daily reconciliation goes on from there. */
export const EXPORT_MAX_ATTEMPTS = 8;

/**
 * FlwChat allows 1,000 requests per 5 minutes per account (docs/flwchat.md), 200 a
 * minute, shared with whatever else uses the account. A row costs up to 4 requests, and
 * runs of one account do not overlap (src/lib/inngest/functions.ts).
 */
const EXPORT_BATCH = 40;

/** A CRM that is down costs a timeout per try: a run gives up early. */
const MAX_TRANSIENT_FAILURES_PER_RUN = 3;

const MAX_WAIT_MINUTES = 60;

export type CrmExportSummary = { contacts: number; appointments: number; notes: number; erased: number; skipped: number; waiting: number; failed: number };

const emptySummary = (): CrmExportSummary => ({ contacts: 0, appointments: 0, notes: 0, erased: 0, skipped: 0, waiting: 0, failed: 0 });

function retryAt(attempts: number, now: Date) {
  return new Date(now.getTime() + Math.min(2 ** (attempts - 1), MAX_WAIT_MINUTES) * 60_000);
}

const due = (now: Date) => ({ crmSyncRequestedAt: { not: null }, OR: [{ crmSyncRetryAt: null }, { crmSyncRetryAt: { lte: now } }] });

const PATIENT_SELECT = { id: true, name: true, phone: true, crmContactId: true } as const;

type PatientRow = { id: string; name: string; phone: string; crmContactId: string | null };

class Run {
  readonly summary = emptySummary();
  private transientFailures = 0;
  /** Set when the run must stop: a refused token, the rate limit, a CRM that is down. */
  stopped = false;
  /** Contacts already known in this run, as a patient's rows come one after another. */
  private readonly contacts = new Map<string, CrmContactRef>();

  constructor(
    readonly practiceId: string,
    readonly accountId: string,
    readonly practiceIds: readonly string[],
    readonly db: PracticeScopedClient,
    readonly crm: CrmSync,
    readonly now: Date,
  ) {}

  /** Handles a failure of a row; `save` records its attempts. Anything that is not the CRM's goes up. */
  async failed(error: unknown, attempts: number, save: (data: { crmSyncAttempts: number; crmSyncRetryAt: Date | null; crmSyncError: string | null }, giveUp: boolean) => Promise<void>) {
    if (!isCrmError(error)) throw error;
    const failure: CrmError = error;
    if (failure.kind === "auth") {
      await markCrmRevoked(this.accountId, failure.message, this.now);
      this.summary.waiting += 1;
      this.stopped = true;
      return;
    }
    if (failure.kind === "rate_limited") {
      this.summary.waiting += 1;
      this.stopped = true;
      return;
    }
    const next = attempts + 1;
    const giveUp = failure.kind !== "transient" || next >= EXPORT_MAX_ATTEMPTS;
    await save({ crmSyncAttempts: next, crmSyncRetryAt: giveUp ? null : retryAt(next, this.now), crmSyncError: giveUp ? failure.kind : null }, giveUp);
    if (giveUp) {
      this.summary.failed += 1;
      console.warn(`CRM export of a row of practice ${this.practiceId} failed: ${failure.message}`);
    } else {
      this.summary.waiting += 1;
    }
    if (failure.kind === "transient") {
      this.transientFailures += 1;
      if (this.transientFailures >= MAX_TRANSIENT_FAILURES_PER_RUN) this.stopped = true;
    }
  }

  /** Links the patient to the CRM's contact of the number, as it is, or creates it with the patient's name. */
  private async linkContact(patient: PatientRow) {
    const contact = (await this.crm.findContactByPhone(patient.phone)) ?? (await this.crm.createContact({ name: patient.name, phone: patient.phone }));
    await this.db.patient.update({ where: { id: patient.id }, data: { crmContactId: contact.id } });
    this.summary.contacts += 1;
    const ref = { id: contact.id, phone: patient.phone };
    this.contacts.set(patient.id, ref);
    return ref;
  }

  /** "Paciente criado ou celular alterado": the contact exists, with the patient's phone. */
  async writeContact(patient: PatientRow) {
    if (patient.crmContactId) {
      try {
        await this.crm.updateContactPhone(patient.crmContactId, patient.phone);
        this.summary.contacts += 1;
        this.contacts.set(patient.id, { id: patient.crmContactId, phone: patient.phone });
        return;
      } catch (error) {
        // Deleted in the CRM: link again.
        if (!isCrmError(error, "not_found")) throw error;
      }
    }
    await this.linkContact(patient);
  }

  /** The patient's contact for an appointment's tag and note. */
  async contactOf(patient: PatientRow) {
    const known = this.contacts.get(patient.id);
    if (known) return known;
    if (patient.crmContactId) return { id: patient.crmContactId, phone: patient.phone };
    return this.linkContact(patient);
  }

  async forgetContact(patient: PatientRow) {
    this.contacts.delete(patient.id);
    return this.linkContact({ ...patient, crmContactId: null });
  }
}

/** The status tag shows the patient's next appointment, in any practice of the account; the other agenda tags come off. */
async function writeTag(run: Run, contact: CrmContactRef) {
  const tag = statusTagOf(await appointmentsOfContact(run.practiceIds, contact), run.now);
  if (!tag) return;
  await run.crm.updateTags(contact, { add: [tag], remove: ALL_STATUS_TAGS.filter((other) => other !== tag) });
}

async function exportPatients(run: Run, limit: number) {
  const rows = await run.db.patient.findMany({
    where: { ...due(run.now), anonymizedAt: null },
    orderBy: { crmSyncRequestedAt: "asc" },
    take: limit,
    select: { ...PATIENT_SELECT, crmSyncRequestedAt: true, crmSyncAttempts: true },
  });
  for (const row of rows) {
    if (run.stopped) break;
    const clearMark = () => run.db.patient.updateMany({ where: { id: row.id, crmSyncRequestedAt: row.crmSyncRequestedAt }, data: { crmSyncRequestedAt: null } });
    if (!row.phone) {
      await clearMark();
      run.summary.skipped += 1;
      continue;
    }
    try {
      await run.writeContact({ ...row, phone: row.phone });
      await run.db.patient.update({ where: { id: row.id }, data: CLEAR_CRM_RETRY });
      await clearMark();
    } catch (error) {
      await run.failed(error, row.crmSyncAttempts, async (data, giveUp) => {
        await run.db.patient.update({ where: { id: row.id }, data });
        if (giveUp) await clearMark();
      });
    }
  }
  return rows.length;
}

const APPOINTMENT_SELECT = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  crmSyncRequestedAt: true,
  crmSyncAttempts: true,
  crmSyncedAt: true,
  crmSyncedStatus: true,
  patient: { select: { ...PATIENT_SELECT, anonymizedAt: true } },
  professional: { select: { name: true, whatsappInstance: { select: { phoneNumber: true } } } },
  location: { select: { name: true, timeZone: true } },
  appointmentType: { select: { displayName: true, category: true } },
} as const;

async function loadAppointments(run: Run, limit: number) {
  return run.db.appointment.findMany({ where: due(run.now), orderBy: { crmSyncRequestedAt: "asc" }, take: limit, select: APPOINTMENT_SELECT });
}

type AppointmentRow = Awaited<ReturnType<typeof loadAppointments>>[number];

/**
 * The tag, and the note when the status is one the conversation was not told yet. With
 * no number for the professional there is no conversation that is surely this practice's,
 * so no note.
 */
async function writeAppointment(run: Run, row: AppointmentRow, contact: CrmContactRef) {
  await writeTag(run, contact);
  const channelNumber = row.professional.whatsappInstance?.phoneNumber ?? null;
  if (!channelNumber || !isCrmSyncedStatus(row.status) || row.crmSyncedStatus === row.status) return null;
  return run.crm.addNote(
    contact,
    statusNote({
      status: row.status,
      typeLabel: appointmentTypeDisplayName(row.appointmentType),
      professionalName: row.professional.name,
      locationName: row.location.name,
      startsAt: row.startsAt,
      timeZone: row.location.timeZone,
    }),
    { channelNumber },
  );
}

async function exportAppointments(run: Run, limit: number) {
  for (const row of await loadAppointments(run, limit)) {
    if (run.stopped) break;
    const clearMark = () => run.db.appointment.updateMany({ where: { id: row.id, crmSyncRequestedAt: row.crmSyncRequestedAt }, data: { crmSyncRequestedAt: null } });
    const { patient } = row;
    if (!patient.phone || patient.anonymizedAt || (!row.crmSyncedAt && row.endsAt <= run.now)) {
      await clearMark();
      run.summary.skipped += 1;
      continue;
    }
    const withPhone = { ...patient, phone: patient.phone };
    try {
      let contact = await run.contactOf(withPhone);
      let note: { noteId: string } | null;
      try {
        note = await writeAppointment(run, row, contact);
      } catch (error) {
        // The contact was deleted in the CRM: link again and write once more.
        if (!isCrmError(error, "not_found")) throw error;
        contact = await run.forgetContact(withPhone);
        note = await writeAppointment(run, row, contact);
      }
      await run.db.appointment.update({
        where: { id: row.id },
        data: {
          ...CLEAR_CRM_RETRY,
          crmSyncedAt: run.now,
          crmSyncedStatus: isCrmSyncedStatus(row.status) ? row.status : row.crmSyncedStatus,
          ...(note ? { crmNoteIds: { push: note.noteId } } : {}),
        },
      });
      await clearMark();
      run.summary.appointments += 1;
      if (note) run.summary.notes += 1;
    } catch (error) {
      await run.failed(error, row.crmSyncAttempts, async (data, giveUp) => {
        await run.db.appointment.update({ where: { id: row.id }, data });
        if (giveUp) await clearMark();
      });
    }
  }
}

/**
 * Takes back what the agenda wrote about an erased patient (D-28): the notes and the
 * tags. The API has no way to delete a contact (docs/flwchat.md), and the contact and
 * its conversations are the CRM's own; the manager is told on the erasure screen.
 * Keeps trying until it works: nothing else would clear the notes. On a shared account
 * the tags of a patient still alive in another practice are written again by that
 * practice's next export.
 */
async function eraseMarked(run: Run, limit: number) {
  const rows = await run.db.patient.findMany({
    where: { crmEraseRequestedAt: { not: null }, OR: [{ crmSyncRetryAt: null }, { crmSyncRetryAt: { lte: run.now } }] },
    take: limit,
    select: { id: true, crmContactId: true, crmSyncAttempts: true },
  });
  for (const row of rows) {
    if (run.stopped) break;
    try {
      const appointments = await run.db.appointment.findMany({ where: { patientId: row.id, NOT: { crmNoteIds: { isEmpty: true } } }, select: { crmNoteIds: true } });
      for (const noteId of appointments.flatMap((appointment) => appointment.crmNoteIds)) await run.crm.deleteNote(noteId);
      const contact = row.crmContactId ? await run.crm.getContact(row.crmContactId) : null;
      if (contact) await run.crm.updateTags(contact, { add: [], remove: [...ALL_STATUS_TAGS, ...Object.values(CRM_COMMAND_TAGS)] });
      await run.db.$transaction(async (tx) => {
        await tx.patient.update({ where: { id: row.id }, data: { crmContactId: null, crmEraseRequestedAt: null, ...CLEAR_CRM_RETRY } });
        await tx.appointment.updateMany({ where: { patientId: row.id }, data: { crmNoteIds: [], crmSyncedStatus: null } });
      });
      run.summary.erased += 1;
    } catch (error) {
      await run.failed(error, row.crmSyncAttempts, async (data) => {
        await run.db.patient.update({ where: { id: row.id }, data: { crmSyncAttempts: data.crmSyncAttempts, crmSyncRetryAt: data.crmSyncRetryAt ?? retryAt(data.crmSyncAttempts, run.now), crmSyncError: data.crmSyncError } });
      });
    }
  }
  return rows.length;
}

/** Exports what is due in the practice. A revoked account waits, calling nothing. */
export async function exportToCrm(practiceId: string, options: CrmSyncOptions = {}): Promise<CrmExportSummary> {
  const now = options.now ?? new Date();
  const db = forPractice(practiceId);
  const account = await crmAccountOf(db);
  if (!account) return emptySummary();
  if (account.status !== "ACTIVE") {
    const [patients, appointments] = await Promise.all([db.patient.count({ where: { crmSyncRequestedAt: { not: null } } }), db.appointment.count({ where: { crmSyncRequestedAt: { not: null } } })]);
    return { ...emptySummary(), waiting: patients + appointments };
  }
  const run = new Run(practiceId, account.id, await practicesOfAccount(account.id), db, options.provider ?? crmProviderFor(account), now);
  let budget = EXPORT_BATCH;
  budget -= await eraseMarked(run, budget);
  if (budget > 0 && !run.stopped) budget -= await exportPatients(run, budget);
  if (budget > 0 && !run.stopped) await exportAppointments(run, budget);
  return run.summary;
}
