"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { AppointmentCategory } from "@/generated/prisma/enums";
import { AGENDA_ERROR_TEXT, AgendaError } from "@/lib/agenda/errors";
import {
  createAppointmentType,
  setAppointmentTypeActive,
  updateAppointmentType,
  type AppointmentTypeInput,
} from "@/lib/appointment-types/appointment-types";
import { requirePracticePermission } from "@/lib/auth/guard";
import { parseMoneyToCents } from "@/lib/domain/money";

export type TypeFormState = { error?: string };

const PRICE_PREFIX = "price:";

function readInput(formData: FormData): AppointmentTypeInput | { error: string } {
  const text = (name: string) => String(formData.get(name) ?? "");
  const defaultPriceCents = parseMoneyToCents(text("price"));
  if (defaultPriceCents === null) return { error: AGENDA_ERROR_TEXT.invalid_price };
  const professionalPrices: AppointmentTypeInput["professionalPrices"] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith(PRICE_PREFIX) || typeof value !== "string" || !value.trim()) continue;
    const priceCents = parseMoneyToCents(value);
    if (priceCents === null) return { error: AGENDA_ERROR_TEXT.invalid_price };
    professionalPrices.push({ professionalId: key.slice(PRICE_PREFIX.length), priceCents });
  }
  return {
    name: text("name"),
    displayName: text("displayName"),
    category: text("category") as AppointmentCategory,
    durationMinutes: Number(text("durationMinutes")),
    defaultPriceCents,
    color: text("color"),
    preparation: text("preparation"),
    cadenceId: text("cadenceId") || null,
    professionalPrices,
  };
}

/** Creates (typeId null) or updates a type, then goes back to the list. */
export async function saveAppointmentType(
  practiceId: string,
  typeId: string | null,
  _state: TypeFormState,
  formData: FormData,
): Promise<TypeFormState> {
  const context = await requirePracticePermission(practiceId, "appointment-types:edit");
  const input = readInput(formData);
  if ("error" in input) return input;
  try {
    if (typeId) await updateAppointmentType(context, typeId, input);
    else await createAppointmentType(context, input);
  } catch (error) {
    if (error instanceof AgendaError) return { error: AGENDA_ERROR_TEXT[error.code] };
    throw error;
  }
  redirect(`/conta/${practiceId}/tipos`);
}

export async function toggleAppointmentType(practiceId: string, typeId: string, active: boolean): Promise<TypeFormState> {
  const context = await requirePracticePermission(practiceId, "appointment-types:edit");
  try {
    await setAppointmentTypeActive(context, typeId, active);
  } catch (error) {
    if (error instanceof AgendaError) return { error: AGENDA_ERROR_TEXT[error.code] };
    throw error;
  }
  refresh();
  return {};
}
