import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { AgendaError } from "@/lib/agenda/errors";
import { markPatientsForCrmSync, requestCrmSync } from "@/lib/crm/queue";
import { DEFAULT_INSURANCE } from "@/lib/patients/patients";
import { normalizePhone } from "@/lib/patients/phone";
import { MAX_PATIENT_ROWS, ROW_ERROR } from "./errors";
import { chunks, readSheet, rowError, type ImportReport, type ImportRowError } from "./sheet";
import { parseYesNo, PATIENT_COLUMNS } from "./templates";

/**
 * Patient spreadsheet import (PRD 4 rule 9; D-18, D-48). Patients are
 * deduplicated by the normalized phone within the practice: a phone already
 * registered counts as existing and nothing of that patient changes, consent
 * included. Rows are checked first; valid new patients go in batches, each with
 * its consent (channel IMPORT) and audit event in one transaction.
 */

const MAX_NAME = 120;
const MAX_INSURANCE = 80;
const MAX_NOTES = 1000;
const QUERY_CHUNK = 1000;
const INSERT_CHUNK = 500;

export type NewPatient = { name: string; phone: string; insurance: string | null; notes: string | null; consent: boolean | null };

function assertCanImport({ access }: PracticeContext) {
  if (!can(access.role, "patients:import")) throw new AgendaError("not_allowed", "Only the manager imports");
}

/** Phones (E.164) of the list that are already registered in the practice. */
export async function registeredPhones({ db }: PracticeContext, phones: string[]) {
  const found = new Map<string, string>();
  for (const chunk of chunks(phones, QUERY_CHUNK)) {
    for (const patient of await db.patient.findMany({ where: { phone: { in: chunk } }, select: { id: true, phone: true } })) {
      found.set(patient.phone!, patient.id);
    }
  }
  return found;
}

async function insertBatch(context: PracticeContext, batch: NewPatient[]) {
  const { user, access, db } = context;
  return db.$transaction(async (tx) => {
    const created = await tx.patient.createManyAndReturn({
      data: batch.map((patient) => ({
        practiceId: access.practiceId,
        name: patient.name,
        phone: patient.phone,
        insurance: patient.insurance ?? DEFAULT_INSURANCE,
        notes: patient.notes,
      })),
      select: { id: true, phone: true },
    });
    const idByPhone = new Map(created.map((patient) => [patient.phone!, patient.id]));
    const consents = batch.flatMap((patient) =>
      patient.consent === null
        ? []
        : [{ practiceId: access.practiceId, patientId: idByPhone.get(patient.phone)!, granted: patient.consent, channel: "IMPORT" as const, recordedByUserId: user.id }],
    );
    if (consents.length > 0) await tx.contactConsent.createMany({ data: consents });
    await tx.auditEvent.createMany({
      data: created.map((patient) => ({
        practiceId: access.practiceId,
        actorType: "USER" as const,
        actorUserId: user.id,
        action: "patient.imported",
        entityType: "Patient",
        entityId: patient.id,
        changedFields: [],
      })),
    });
    // PRD 6: new patients become contacts in SynkronosCRM; whoever imports asks Inngest once (D-68).
    await markPatientsForCrmSync(tx, created.map((patient) => patient.id));
    return idByPhone;
  });
}

/**
 * Creates the patients whose phone is not registered yet and returns the id of
 * every phone. Someone registering one of them meanwhile makes the batch fail on
 * the unique phone; it is then read again and retried once.
 */
export async function createMissingPatients(context: PracticeContext, patients: NewPatient[]) {
  const ids = await registeredPhones(context, patients.map((patient) => patient.phone));
  let created = 0;
  for (const batch of chunks(patients.filter((patient) => !ids.has(patient.phone)), INSERT_CHUNK)) {
    let inserted: Map<string, string>;
    try {
      inserted = await insertBatch(context, batch);
    } catch (error) {
      if ((error as { code?: unknown }).code !== "P2002") throw error;
      const taken = await registeredPhones(context, batch.map((patient) => patient.phone));
      taken.forEach((id, phone) => ids.set(phone, id));
      inserted = await insertBatch(context, batch.filter((patient) => !taken.has(patient.phone)));
    }
    inserted.forEach((id, phone) => ids.set(phone, id));
    created += inserted.size;
  }
  return { ids, created, existing: patients.length - created };
}

const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

export async function importPatients(context: PracticeContext, bytes: Uint8Array): Promise<ImportReport> {
  assertCanImport(context);
  const sheet = readSheet(bytes, PATIENT_COLUMNS, MAX_PATIENT_ROWS);
  const errors: ImportRowError[] = [];
  const patients: NewPatient[] = [];
  const firstLine = new Map<string, number>();

  for (const row of sheet.rows) {
    const messages: string[] = [];
    const name = collapse(sheet.cell(row, "nome"));
    if (!name) messages.push(ROW_ERROR.nameRequired);
    else if (name.length > MAX_NAME) messages.push(ROW_ERROR.textTooLong("nome"));
    const typedPhone = sheet.cell(row, "celular");
    const phone = typedPhone ? normalizePhone(typedPhone) : null;
    if (!typedPhone) messages.push(ROW_ERROR.phoneRequired);
    else if (!phone) messages.push(ROW_ERROR.invalidPhone);
    const insurance = sheet.cell(row, "convenio") || null;
    if (insurance && insurance.length > MAX_INSURANCE) messages.push(ROW_ERROR.textTooLong("convenio"));
    const notes = sheet.cell(row, "observacoes") || null;
    if (notes && notes.length > MAX_NOTES) messages.push(ROW_ERROR.textTooLong("observacoes"));
    const consent = parseYesNo(sheet.cell(row, "consentimento_whatsapp"));
    if (consent === "invalid") messages.push(ROW_ERROR.invalidConsent);
    // The first valid row of a phone wins; a later one is a mistake in the sheet.
    if (messages.length === 0 && phone) {
      const first = firstLine.get(phone);
      if (first) messages.push(ROW_ERROR.duplicatePhone(first));
      else firstLine.set(phone, row.line);
    }

    if (messages.length > 0) errors.push(rowError(row, messages));
    else patients.push({ name, phone: phone!, insurance, notes, consent: consent === "empty" ? null : consent === "yes" });
  }

  const { created, existing } = await createMissingPatients(context, patients);
  await requestCrmSync(context.access.practiceId, context.db);
  return { header: sheet.header, delimiter: sheet.delimiter, totalRows: sheet.rows.length, created, existing, errors };
}
