"use server";

import { refresh } from "next/cache";
import { AGENDA_ERROR_TEXT, AgendaError } from "@/lib/agenda/errors";
import { requirePracticePermission } from "@/lib/auth/guard";
import { resolveGoogleChange, type GoogleChangeDecision } from "@/lib/google/changes";
import { recordConfirmationWorkMinute } from "@/lib/indicators/indicators";

/** Server Actions of Pendências; the service checks who resolves (D-10, D-40). */

export type GoogleActionResult = { error?: string; details?: string[] };

export async function resolveGoogleChangeAction(
  practiceId: string,
  input: { changeId: string; decision: GoogleChangeDecision; allowConflict?: boolean },
): Promise<GoogleActionResult> {
  const context = await requirePracticePermission(practiceId, ["google-changes:resolve", "google-changes:resolve-own"]);
  if (input.decision !== "accept" && input.decision !== "revert") return { error: AGENDA_ERROR_TEXT.not_allowed };
  try {
    await resolveGoogleChange(context, input);
  } catch (error) {
    if (error instanceof AgendaError) return { error: AGENDA_ERROR_TEXT[error.code], details: error.details };
    throw error;
  }
  refresh();
  return {};
}

/** A minute on the unconfirmed appointments, from the screen's heartbeat (D-75, D-84). */
export async function recordConfirmationWorkAction(practiceId: string) {
  const context = await requirePracticePermission(practiceId, "agenda:view");
  await recordConfirmationWorkMinute(context);
}
