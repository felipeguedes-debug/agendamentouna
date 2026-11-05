"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { AGENDA_ERROR_TEXT, AgendaError } from "@/lib/agenda/errors";
import { requirePracticePermission } from "@/lib/auth/guard";
import { createCadence, saveCadence, saveSendWindow, type CadenceInput, type SendWindowInput, type StepInput } from "@/lib/cadence/editor";

/**
 * Server Actions of the cadence screen. The guard checks the permission; the
 * services check the rules and the data again (D-40). What comes from the browser is
 * coerced to the expected shape before it reaches them.
 */

export type CadenceActionResult = { error?: string; details?: string[]; saved?: boolean };

function failure(error: unknown): CadenceActionResult {
  if (error instanceof AgendaError) return { error: AGENDA_ERROR_TEXT[error.code], details: error.details };
  throw error;
}

const asString = (value: unknown) => (typeof value === "string" ? value : "");
const asStrings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);

function readCadence(raw: CadenceInput): CadenceInput {
  const steps = Array.isArray(raw.steps) ? raw.steps : [];
  return {
    name: asString(raw.name),
    active: raw.active === true,
    typeIds: asStrings(raw.typeIds),
    professionalIds: asStrings(raw.professionalIds),
    steps: steps.map(
      (step): StepInput => ({
        when: asString(step?.when) as StepInput["when"],
        amount: Number(step?.amount),
        time: asString(step?.time),
        statuses: asString(step?.statuses) as StepInput["statuses"],
        action: asString(step?.action) as StepInput["action"],
        template: asString(step?.template),
      }),
    ),
  };
}

export async function createCadenceAction(practiceId: string) {
  const context = await requirePracticePermission(practiceId, "cadence:edit");
  const id = await createCadence(context, "Nova régua");
  redirect(`/conta/${practiceId}/regua?regua=${id}`);
}

export async function saveCadenceAction(practiceId: string, cadenceId: string, input: CadenceInput): Promise<CadenceActionResult> {
  const context = await requirePracticePermission(practiceId, "cadence:edit");
  try {
    await saveCadence(context, cadenceId, readCadence(input));
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { saved: true };
}

export async function saveSendWindowAction(practiceId: string, input: SendWindowInput): Promise<CadenceActionResult> {
  const context = await requirePracticePermission(practiceId, "practice-settings:edit");
  try {
    await saveSendWindow(context, {
      start: asString(input.start),
      end: asString(input.end),
      days: Array.isArray(input.days) ? input.days.map(Number) : [],
      marginHours: Number(input.marginHours),
    });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { saved: true };
}
