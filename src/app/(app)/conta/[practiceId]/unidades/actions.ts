"use server";

import { refresh } from "next/cache";
import { AGENDA_ERROR_TEXT, AgendaError } from "@/lib/agenda/errors";
import { requirePracticePermission } from "@/lib/auth/guard";
import {
  addScheduleException,
  addWorkingHours,
  removeScheduleException,
  removeWorkingHours,
  saveLocation,
  setLocationActive,
  updateWorkingHours,
  type ExceptionInput,
  type LocationInput,
  type WorkingHoursInput,
} from "@/lib/locations/locations";

/** Server Actions of Unidades e horários (D-86). The services check the permission again (D-40). */

export type ActionResult = { error?: string };

const SETTINGS = "practice-settings:edit" as const;

async function run(practiceId: string, action: (context: Awaited<ReturnType<typeof requirePracticePermission>>) => Promise<unknown>): Promise<ActionResult> {
  const context = await requirePracticePermission(practiceId, SETTINGS);
  try {
    await action(context);
  } catch (error) {
    if (error instanceof AgendaError) return { error: AGENDA_ERROR_TEXT[error.code] };
    throw error;
  }
  refresh();
  return {};
}

export async function saveLocationAction(practiceId: string, input: LocationInput) {
  return run(practiceId, (context) => saveLocation(context, input));
}

export async function setLocationActiveAction(practiceId: string, locationId: string, active: boolean) {
  return run(practiceId, (context) => setLocationActive(context, locationId, active));
}

export async function saveWorkingHoursAction(practiceId: string, id: string | null, input: WorkingHoursInput) {
  return run(practiceId, (context) => (id ? updateWorkingHours(context, id, input) : addWorkingHours(context, input)));
}

export async function removeWorkingHoursAction(practiceId: string, id: string) {
  return run(practiceId, (context) => removeWorkingHours(context, id));
}

export async function addExceptionAction(practiceId: string, input: ExceptionInput) {
  return run(practiceId, (context) => addScheduleException(context, input));
}

export async function removeExceptionAction(practiceId: string, id: string) {
  return run(practiceId, (context) => removeScheduleException(context, id));
}
