"use server";

import { refresh } from "next/cache";
import { AGENDA_ERROR_TEXT, AgendaError } from "@/lib/agenda/errors";
import { blockConflicts, createTimeBlock, removeTimeBlock, updateTimeBlock, type TimeBlockInput } from "@/lib/agenda/time-blocks";
import { requirePracticePermission } from "@/lib/auth/guard";

/** Server Actions of the manual blocks (D-85); the service checks whose agenda it is. */

const PERMISSIONS = ["time-blocks:manage", "time-blocks:manage-own"] as const;

type Result = { error?: string };

function failure(error: unknown): Result {
  if (error instanceof AgendaError) return { error: AGENDA_ERROR_TEXT[error.code] };
  throw error;
}

export async function blockConflictsAction(practiceId: string, input: Omit<TimeBlockInput, "reason">) {
  const context = await requirePracticePermission(practiceId, PERMISSIONS);
  try {
    return await blockConflicts(context, input);
  } catch (error) {
    if (error instanceof AgendaError) return [];
    throw error;
  }
}

export async function saveBlockAction(practiceId: string, blockId: string | null, input: TimeBlockInput): Promise<Result> {
  const context = await requirePracticePermission(practiceId, PERMISSIONS);
  try {
    if (blockId) await updateTimeBlock(context, blockId, input);
    else await createTimeBlock(context, input);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

export async function removeBlockAction(practiceId: string, blockId: string): Promise<Result> {
  const context = await requirePracticePermission(practiceId, PERMISSIONS);
  try {
    await removeTimeBlock(context, blockId);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}
