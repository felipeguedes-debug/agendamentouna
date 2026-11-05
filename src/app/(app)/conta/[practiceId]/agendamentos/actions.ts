"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { AppointmentStatus, LeadSource } from "@/generated/prisma/enums";
import { loadDayPreview } from "@/lib/agenda/agenda";
import { AGENDA_ERROR_TEXT, AgendaError } from "@/lib/agenda/errors";
import { changeAppointmentStatus, createAppointment, rescheduleAppointment } from "@/lib/appointments/appointments";
import { requirePracticePermission } from "@/lib/auth/guard";
import { queueManualDispatch, recordManualContact, resumeCadence } from "@/lib/cadence/worklist";
import { isIsoDate } from "@/lib/dates/zoned";
import { isManualConsentChannel } from "@/lib/domain/consent";
import { parseMoneyToCents } from "@/lib/domain/money";
import { createPatientQuick, searchPatients, type PatientOption } from "@/lib/patients/patients";

/**
 * Server Actions of the agenda. Each one checks access and permission with the
 * guard and delegates to the services, which check the rules again (D-40).
 */

export type ActionResult = { error?: string; details?: string[] };

function failure(error: unknown): ActionResult & { patient?: { id: string; name: string } } {
  if (error instanceof AgendaError) return { error: AGENDA_ERROR_TEXT[error.code], details: error.details, patient: error.patient };
  throw error;
}

const BOOKING = "appointments:manage" as const;

export async function searchPatientsAction(practiceId: string, term: string): Promise<PatientOption[]> {
  const context = await requirePracticePermission(practiceId, BOOKING);
  return searchPatients(context, term);
}

export async function createPatientAction(
  practiceId: string,
  input: { name: string; phone: string; insurance: string; consentChannel: string | null },
): Promise<{ patient?: PatientOption; error?: string; existing?: { id: string; name: string } }> {
  const context = await requirePracticePermission(practiceId, BOOKING);
  const { consentChannel } = input;
  if (consentChannel !== null && !isManualConsentChannel(consentChannel)) return { error: AGENDA_ERROR_TEXT.invalid_channel };
  try {
    return { patient: await createPatientQuick(context, { ...input, consentChannel }) };
  } catch (error) {
    const result = failure(error);
    return { error: result.error, existing: result.patient };
  }
}

export async function dayPreviewAction(practiceId: string, professionalId: string, date: string) {
  const context = await requirePracticePermission(practiceId, BOOKING);
  if (!isIsoDate(date)) return null;
  return loadDayPreview(context, { professionalId, date });
}

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function createAppointmentAction(practiceId: string, _state: ActionResult, formData: FormData): Promise<ActionResult> {
  const context = await requirePracticePermission(practiceId, BOOKING);
  const price = text(formData, "price");
  const priceCents = price ? parseMoneyToCents(price) : undefined;
  if (priceCents === null) return { error: AGENDA_ERROR_TEXT.invalid_price };
  const duration = text(formData, "durationMinutes");
  let id: string;
  try {
    ({ id } = await createAppointment(context, {
      patientId: text(formData, "patientId"),
      professionalId: text(formData, "professionalId"),
      locationId: text(formData, "locationId"),
      appointmentTypeId: text(formData, "appointmentTypeId"),
      date: text(formData, "date"),
      time: text(formData, "time"),
      durationMinutes: duration ? Number(duration) : undefined,
      priceCents,
      leadSource: (text(formData, "leadSource") || null) as LeadSource | null,
      insurance: text(formData, "insurance"),
      internalNote: text(formData, "internalNote"),
      allowConflict: formData.get("allowConflict") === "on",
    }));
  } catch (error) {
    return failure(error);
  }
  redirect(`/conta/${practiceId}?data=${text(formData, "date")}&agendamento=${id}`);
}

/** Every role that sees an agenda may try; the status table decides (D-44). */
export async function changeStatusAction(
  practiceId: string,
  input: { appointmentId: string; from: AppointmentStatus; to: AppointmentStatus; reason?: string },
): Promise<ActionResult> {
  const context = await requirePracticePermission(practiceId, ["agenda:view", "agenda:view-own"]);
  try {
    await changeAppointmentStatus(context, input);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

/** PRD 6, rule 3: the text of a step of the appointment's cadence, sent now. */
export async function manualDispatchAction(practiceId: string, input: { appointmentId: string; stepId: string }): Promise<ActionResult> {
  const context = await requirePracticePermission(practiceId, "dispatch:manual");
  try {
    await queueManualDispatch(context, input);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

/** D-06: the office reached the patient; the confirmation requests end. */
export async function manualContactAction(practiceId: string, appointmentId: string): Promise<ActionResult> {
  const context = await requirePracticePermission(practiceId, BOOKING);
  try {
    await recordManualContact(context, appointmentId);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

/** D-05: the free-text reply was handled in SynkronosCRM; the cadence goes on. */
export async function resumeCadenceAction(practiceId: string, appointmentId: string): Promise<ActionResult> {
  const context = await requirePracticePermission(practiceId, BOOKING);
  try {
    await resumeCadence(context, appointmentId);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

export async function rescheduleAction(practiceId: string, appointmentId: string, _state: ActionResult, formData: FormData): Promise<ActionResult> {
  const context = await requirePracticePermission(practiceId, BOOKING);
  let id: string;
  try {
    ({ id } = await rescheduleAppointment(context, {
      appointmentId,
      date: text(formData, "date"),
      time: text(formData, "time"),
      professionalId: text(formData, "professionalId") || undefined,
      locationId: text(formData, "locationId") || undefined,
      allowConflict: formData.get("allowConflict") === "on",
    }));
  } catch (error) {
    return failure(error);
  }
  redirect(`/conta/${practiceId}?data=${text(formData, "date")}&agendamento=${id}`);
}
