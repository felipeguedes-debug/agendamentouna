"use server";

import { refresh } from "next/cache";
import { AGENDA_ERROR_TEXT, AgendaError } from "@/lib/agenda/errors";
import { requirePracticePermission, requireUser } from "@/lib/auth/guard";
import { setTwoFactorRequired } from "@/lib/auth/two-factor-requirement";
import { disconnectCrm, registerCrmWebhook, saveCrmToken } from "@/lib/crm/connection";
import { retryFailedCrmExports } from "@/lib/crm/settings";

/**
 * Server Actions of the Configurações screen. The guard checks the permission; the
 * services check it again (D-40). The token only goes in, never back.
 */

export type SettingsActionResult = { error?: string; saved?: boolean };

function failure(error: unknown): SettingsActionResult {
  if (error instanceof AgendaError) return { error: AGENDA_ERROR_TEXT[error.code] };
  throw error;
}

export async function setTwoFactorRequiredAction(practiceId: string, required: boolean): Promise<SettingsActionResult> {
  const context = await requirePracticePermission(practiceId, "practice-settings:edit");
  try {
    await setTwoFactorRequired(context, required);
  } catch (error) {
    return failure(error);
  }
  // The guard's rule (D-36): the manager who has not set it up goes to the security page now.
  await requireUser();
  refresh();
  return { saved: true };
}

export async function saveCrmTokenAction(practiceId: string, _state: SettingsActionResult, formData: FormData): Promise<SettingsActionResult> {
  const context = await requirePracticePermission(practiceId, "practice-settings:edit");
  try {
    await saveCrmToken(context, String(formData.get("token") ?? ""));
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { saved: true };
}

export async function disconnectCrmAction(practiceId: string): Promise<SettingsActionResult> {
  const context = await requirePracticePermission(practiceId, "practice-settings:edit");
  try {
    await disconnectCrm(context);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

export async function registerCrmWebhookAction(practiceId: string): Promise<SettingsActionResult> {
  const context = await requirePracticePermission(practiceId, "practice-settings:edit");
  try {
    await registerCrmWebhook(context);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { saved: true };
}

export async function retryCrmExportsAction(practiceId: string): Promise<SettingsActionResult> {
  const context = await requirePracticePermission(practiceId, "practice-settings:edit");
  await retryFailedCrmExports(context);
  refresh();
  return { saved: true };
}
