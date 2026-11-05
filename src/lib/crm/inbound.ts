import { randomUUID } from "node:crypto";
import { AgendaError } from "@/lib/agenda/errors";
import { changeAppointmentStatus } from "@/lib/appointments/appointments";
import { SENT_DISPATCH_STATUSES } from "@/lib/cadence/plan";
import { applyManualContact } from "@/lib/cadence/worklist";
import { forPractice, type PracticeScopedClient } from "@/lib/db";
import { phoneVariants } from "@/lib/patients/phone";
import { crmAccountById, practicesOfAccount, type CrmAccountRow } from "./account";
import { crmProviderFor, type CrmSyncOptions } from "./index";
import type { CrmContact, CrmSync } from "./provider";
import { commandFailureNote, commandsIn, commandTagsIn, manualContactNote, type CrmCommand, type CrmOutcome } from "./rules";

/**
 * The secretary's commands (PRD 6; D-05, D-06, D-08, D-66, D-73). FlwChat has no event
 * for "the secretary confirmed": she applies a command tag on the contact, without
 * leaving the conversation, and the agenda acts on it.
 *
 * - The contact is always read again from the API, with the account's token. The webhook
 *   only says "look at this contact", so a forged event finds no tag and does nothing,
 *   and an event repeated after the tag came off does nothing either (D-67).
 * - A tag says nothing about the appointment, so D-08 decides: the appointment of the
 *   latest cadence message sent to that patient, while it is still ahead, and never an
 *   older one. An account may be shared, and the same person may be a patient in two of
 *   its practices: the latest message among them all says which practice this is (D-73).
 * - Confirm changes the status through changeAppointmentStatus, with the CRM as the
 *   actor, and the cadence stops by its table. Manual contact ends the confirmation
 *   requests and closes the follow-up flags, without changing the status (D-06).
 * - The tag always comes off, and when nothing changed a note in the conversation says
 *   why, so the secretary is not left waiting. The patient's messages never come by
 *   here (D-05).
 */

export type CrmOrigin = "webhook" | "retry" | "reconciliation";

export type CommandResult = { command: CrmCommand; outcome: CrmOutcome; appointmentId: string | null };

type Input = { contactId: string; origin: CrmOrigin; deliveryKey?: string };

type FoundPatient = { practiceId: string; db: PracticeScopedClient; id: string; crmContactId: string | null };

async function findPatient(practiceId: string, contact: CrmContact): Promise<FoundPatient | null> {
  const db = forPractice(practiceId);
  const select = { id: true, crmContactId: true } as const;
  const row =
    (await db.patient.findFirst({ where: { crmContactId: contact.id, anonymizedAt: null }, select })) ??
    (contact.phone ? await db.patient.findFirst({ where: { phone: { in: phoneVariants(contact.phone) }, anonymizedAt: null }, select }) : null);
  return row ? { practiceId, db, ...row } : null;
}

/** D-08: the appointment of the latest cadence message sent to the patient, from any instance. */
async function latestCadenceMessage(patient: FoundPatient) {
  const message = await patient.db.dispatch.findFirst({
    where: { status: { in: [...SENT_DISPATCH_STATUSES] }, appointment: { is: { patientId: patient.id } } },
    orderBy: { sentAt: "desc" },
    select: {
      sentAt: true,
      appointment: {
        select: { id: true, status: true, startsAt: true, location: { select: { timeZone: true } }, professional: { select: { whatsappInstance: { select: { phoneNumber: true } } } } },
      },
    },
  });
  return message ? { practiceId: patient.practiceId, db: patient.db, sentAt: message.sentAt, ...message.appointment } : null;
}

type Target = NonNullable<Awaited<ReturnType<typeof latestCadenceMessage>>>;

/** The latest among the practices where this contact is a patient. */
async function latestTarget(patients: readonly FoundPatient[]): Promise<Target | null> {
  const messages = await Promise.all(patients.map(latestCadenceMessage));
  return messages.reduce<Target | null>((latest, message) => (message && (!latest || (message.sentAt?.getTime() ?? 0) > (latest.sentAt?.getTime() ?? 0)) ? message : latest), null);
}

async function confirm(target: Target): Promise<CrmOutcome> {
  if (target.status === "CONFIRMED") return "already_confirmed";
  if (target.status !== "SCHEDULED") return "not_open";
  try {
    await changeAppointmentStatus({ kind: "crm", practiceId: target.practiceId, db: target.db }, { appointmentId: target.id, to: "CONFIRMED", from: "SCHEDULED" });
    return "confirmed";
  } catch (error) {
    if (!(error instanceof AgendaError)) throw error;
    // Changed meanwhile: a repeated delivery confirmed it, or someone closed it.
    const current = await target.db.appointment.findFirst({ where: { id: target.id }, select: { status: true } });
    return current?.status === "CONFIRMED" ? "already_confirmed" : "not_open";
  }
}

async function manualContact(target: Target, now: Date): Promise<CrmOutcome> {
  if (target.status !== "SCHEDULED" && target.status !== "CONFIRMED") return "not_open";
  await target.db.$transaction(async (tx) => {
    // A command that failed to come off the contact arrives again: once is enough.
    if ((await tx.appointmentFlag.count({ where: { appointmentId: target.id, type: "MANUAL_CONTACT" } })) > 0) return;
    await applyManualContact(tx, { practiceId: target.practiceId, appointmentId: target.id, actor: { type: "CRM", userId: null } }, now);
  });
  return "manual_contact";
}

async function applyCommand(command: CrmCommand, patients: readonly FoundPatient[], now: Date): Promise<{ outcome: CrmOutcome; target: Target | null }> {
  if (patients.length === 0) return { outcome: "unknown_contact", target: null };
  const target = await latestTarget(patients);
  if (!target) return { outcome: "no_cadence_message", target: null };
  if (target.startsAt <= now) return { outcome: "appointment_passed", target };
  const outcome = command === "confirm" ? await confirm(target) : await manualContact(target, now);
  return { outcome, target };
}

async function recordEvent(db: PracticeScopedClient, data: { practiceId: string; deliveryKey: string; origin: CrmOrigin; command: CrmCommand; outcome: CrmOutcome; externalContactId: string; patientId: string | null; appointmentId: string | null }) {
  try {
    await db.crmInboundEvent.create({ data });
  } catch (error) {
    // The same delivery, in another request at the same moment.
    if ((error as { code?: unknown }).code !== "P2002") throw error;
  }
}

/** Applies the commands of a contact already read from the API. */
export async function applyCommandsOf(account: CrmAccountRow, crm: CrmSync, contact: CrmContact, input: Pick<Input, "origin" | "deliveryKey">, now: Date): Promise<CommandResult[]> {
  const commands = commandsIn(contact.tags);
  if (commands.length === 0) return [];
  const practiceIds = await practicesOfAccount(account.id);
  const patients = (await Promise.all(practiceIds.map((practiceId) => findPatient(practiceId, contact)))).filter((patient): patient is FoundPatient => patient !== null);
  for (const patient of patients) {
    if (patient.crmContactId !== contact.id) await patient.db.patient.update({ where: { id: patient.id }, data: { crmContactId: contact.id } });
  }

  const deliveryKey = input.deliveryKey ?? `${input.origin}:${randomUUID()}`;
  const results: CommandResult[] = [];
  const notes: { text: string; target: Target | null }[] = [];
  for (const command of commands) {
    const { outcome, target } = await applyCommand(command, patients, now);
    const appointmentId = target?.id ?? null;
    results.push({ command, outcome, appointmentId });

    // The log is the practice's; with no appointment and a shared account, no practice is known.
    const practiceId = target?.practiceId ?? patients[0]?.practiceId ?? (practiceIds.length === 1 ? practiceIds[0] : null);
    if (practiceId) {
      const patientId = patients.find((patient) => patient.practiceId === practiceId)?.id ?? null;
      await recordEvent(forPractice(practiceId), { practiceId, deliveryKey, origin: input.origin, command, outcome, externalContactId: contact.id, patientId, appointmentId });
    }

    if (outcome === "manual_contact" && target) notes.push({ text: manualContactNote({ startsAt: target.startsAt, timeZone: target.location.timeZone }), target });
    else if (outcome !== "confirmed" && outcome !== "already_confirmed") notes.push({ text: commandFailureNote(command, outcome), target });
  }

  const ref = { id: contact.id, phone: contact.phone };
  await crm.updateTags(ref, { add: [], remove: commandTagsIn(contact.tags) });
  for (const { text, target } of notes) {
    const written = await crm.addNote(ref, text, { channelNumber: target?.professional.whatsappInstance?.phoneNumber ?? null });
    // The erasure takes back what the agenda wrote about an appointment (D-28).
    if (written && target) await target.db.appointment.update({ where: { id: target.id }, data: { crmNoteIds: { push: written.noteId } } });
  }
  return results;
}

/** Reads the contact and applies its commands. An account not active does nothing. */
export async function applyContactCommands(accountId: string, input: Input, options: CrmSyncOptions = {}): Promise<CommandResult[]> {
  const account = await crmAccountById(accountId);
  if (!account || account.status !== "ACTIVE") return [];
  const crm = options.provider ?? crmProviderFor(account);
  const contact = await crm.getContact(input.contactId);
  if (!contact) return [];
  return applyCommandsOf(account, crm, contact, input, options.now ?? new Date());
}
