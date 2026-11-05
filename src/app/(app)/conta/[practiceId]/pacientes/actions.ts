"use server";

import { refresh } from "next/cache";
import { AGENDA_ERROR_TEXT, AgendaError } from "@/lib/agenda/errors";
import { requirePracticePermission } from "@/lib/auth/guard";
import { enableImportedCadence, importAgenda } from "@/lib/imports/agenda-import";
import { importFileErrorText, ImportFileError, MAX_FILE_BYTES } from "@/lib/imports/errors";
import { importPatients } from "@/lib/imports/patients-import";
import type { ImportReport } from "@/lib/imports/sheet";
import { isManualConsentChannel, recordConsent } from "@/lib/patients/consent";
import { erasePatient, exportPatientData, type PatientExport } from "@/lib/patients/data-requests";
import { searchPatients, updatePatientPhone } from "@/lib/patients/patients";

/**
 * Server Actions of the Pacientes screens (D-47 to D-50). Each one checks access
 * and permission with the guard and delegates to the services, which check the
 * rules again (D-40).
 */

export type ActionResult = { error?: string };

function failure(error: unknown): ActionResult {
  if (error instanceof AgendaError) return { error: AGENDA_ERROR_TEXT[error.code] };
  if (error instanceof ImportFileError) return { error: importFileErrorText(error) };
  throw error;
}

/** The search on the top bar (D-81): same roles as the list. */
export async function findPatientsAction(practiceId: string, term: string) {
  const context = await requirePracticePermission(practiceId, "patients:view");
  return searchPatients(context, term);
}

export async function recordConsentAction(practiceId: string, patientId: string, _state: ActionResult, formData: FormData): Promise<ActionResult> {
  const context = await requirePracticePermission(practiceId, "patients:consent");
  const channel = String(formData.get("channel") ?? "");
  if (!isManualConsentChannel(channel)) return { error: AGENDA_ERROR_TEXT.invalid_channel };
  try {
    await recordConsent(context, { patientId, granted: formData.get("granted") === "true", channel });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

export async function updatePatientPhoneAction(practiceId: string, patientId: string, _state: ActionResult, formData: FormData): Promise<ActionResult> {
  const context = await requirePracticePermission(practiceId, "appointments:manage");
  try {
    await updatePatientPhone(context, { patientId, phone: String(formData.get("phone") ?? "") });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

export async function exportPatientAction(practiceId: string, patientId: string): Promise<ActionResult & { filename?: string; data?: PatientExport }> {
  const context = await requirePracticePermission(practiceId, "patients:data-requests");
  try {
    return await exportPatientData(context, patientId);
  } catch (error) {
    return failure(error);
  }
}

export async function erasePatientAction(practiceId: string, patientId: string, _state: ActionResult, formData: FormData): Promise<ActionResult> {
  const context = await requirePracticePermission(practiceId, "patients:data-requests");
  try {
    await erasePatient(context, { patientId, confirmation: String(formData.get("confirmation") ?? "") });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

export type ImportState = ActionResult & { kind?: "patients" | "agenda"; fileName?: string; report?: ImportReport };

export async function importAction(practiceId: string, _state: ImportState, formData: FormData): Promise<ImportState> {
  const context = await requirePracticePermission(practiceId, "patients:import");
  const kind = formData.get("kind") === "agenda" ? "agenda" : "patients";
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { kind, error: "Escolha o arquivo CSV da planilha." };
  if (file.size > MAX_FILE_BYTES) return { kind, error: importFileErrorText(new ImportFileError("too_large")) };
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const report = kind === "agenda" ? await importAgenda(context, bytes) : await importPatients(context, bytes);
    refresh();
    return { kind, fileName: file.name, report };
  } catch (error) {
    return { kind, ...failure(error) };
  }
}

export async function enableCadenceAction(practiceId: string, professionalId: string | null): Promise<ActionResult & { enabled?: number }> {
  const context = await requirePracticePermission(practiceId, "cadence:edit");
  try {
    const enabled = await enableImportedCadence(context, professionalId ? { professionalId } : {});
    refresh();
    return { enabled };
  } catch (error) {
    return failure(error);
  }
}
