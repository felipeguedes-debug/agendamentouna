"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { AGENDA_ERROR_TEXT, AgendaError } from "@/lib/agenda/errors";
import { requirePracticePermission } from "@/lib/auth/guard";
import { saveWhatsappInstance } from "@/lib/cadence/instance-setup";
import { unlinkGoogle } from "@/lib/google/connection";
import { createOwnLinkRequest, sendGoogleLink } from "@/lib/google/link";
import { saveBusyCalendars, setAllDayEventsBlock } from "@/lib/google/profile";
import { createProfessional, renameProfessional, setProfessionalActive, setProfessionalLocation } from "@/lib/professionals/professionals";

/**
 * Server Actions of the professional's profile (D-23, D-59, D-60), used by the
 * manager's page and by "Meu perfil". Each checks the permission with the guard;
 * the services check again whose record it is (D-40).
 */

export type ProfileActionResult = { error?: string; success?: string };

function failure(error: unknown): ProfileActionResult {
  if (error instanceof AgendaError) return { error: AGENDA_ERROR_TEXT[error.code] };
  throw error;
}

const MANAGE = "practice-settings:edit" as const;

/** Refused by a rule, the error says why, with what it found (D-91). */
function manageFailure(error: unknown): ProfileActionResult {
  if (error instanceof AgendaError) return { error: [AGENDA_ERROR_TEXT[error.code], ...error.details].join(" ") };
  throw error;
}

export async function createProfessionalAction(practiceId: string, input: { name: string; locationIds: string[] }): Promise<ProfileActionResult & { id?: string }> {
  const context = await requirePracticePermission(practiceId, MANAGE);
  try {
    return await createProfessional(context, input);
  } catch (error) {
    return manageFailure(error);
  }
}

export async function renameProfessionalAction(practiceId: string, professionalId: string, name: string): Promise<ProfileActionResult> {
  const context = await requirePracticePermission(practiceId, MANAGE);
  try {
    await renameProfessional(context, professionalId, name);
  } catch (error) {
    return manageFailure(error);
  }
  refresh();
  return {};
}

export async function setProfessionalLocationAction(practiceId: string, input: { professionalId: string; locationId: string; linked: boolean }): Promise<ProfileActionResult> {
  const context = await requirePracticePermission(practiceId, MANAGE);
  try {
    await setProfessionalLocation(context, input);
  } catch (error) {
    return manageFailure(error);
  }
  refresh();
  return {};
}

export async function setProfessionalActiveAction(practiceId: string, professionalId: string, active: boolean): Promise<ProfileActionResult> {
  const context = await requirePracticePermission(practiceId, MANAGE);
  try {
    await setProfessionalActive(context, professionalId, active);
  } catch (error) {
    return manageFailure(error);
  }
  refresh();
  return {};
}

/** The professional's WhatsApp (D-94): the URL and the token of the instance, tried against WhatsAPI before saving. */
export async function saveWhatsappInstanceAction(practiceId: string, professionalId: string, _state: ProfileActionResult, formData: FormData): Promise<ProfileActionResult> {
  const context = await requirePracticePermission(practiceId, MANAGE);
  let webhook: "configured" | "failed";
  try {
    ({ webhook } = await saveWhatsappInstance(context, professionalId, { apiUrl: String(formData.get("apiUrl") ?? ""), token: String(formData.get("token") ?? ""), phone: String(formData.get("phone") ?? "") }));
  } catch (error) {
    return failure(error);
  }
  refresh();
  if (webhook === "failed") return { error: "A instância foi salva, mas a WhatsAPI não aceitou o webhook: as respostas dos pacientes não vão chegar. Salve de novo para tentar outra vez; o token em branco continua o salvo." };
  return { success: "Instância salva." };
}

/** The professional's own "Vincular": a short link request, then Google's consent through the start route. */
export async function linkOwnGoogleAction(practiceId: string) {
  const context = await requirePracticePermission(practiceId, "google:link-own");
  let token: string;
  try {
    token = await createOwnLinkRequest(context);
  } catch (error) {
    return failure(error);
  }
  redirect(`/api/google/oauth/start?token=${encodeURIComponent(token)}`);
}

export async function sendGoogleLinkAction(practiceId: string, professionalId: string, _state: ProfileActionResult, formData: FormData): Promise<ProfileActionResult> {
  const context = await requirePracticePermission(practiceId, "google:send-link");
  try {
    const { sentTo } = await sendGoogleLink(context, { professionalId, email: String(formData.get("email") ?? "") || null });
    return { success: `Link enviado para ${sentTo}. Ele vale por 7 dias.` };
  } catch (error) {
    return failure(error);
  }
}

export async function unlinkGoogleAction(practiceId: string, professionalId: string): Promise<ProfileActionResult> {
  const context = await requirePracticePermission(practiceId, ["google:send-link", "google:link-own"]);
  try {
    await unlinkGoogle(context, professionalId);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}

export async function saveBusyCalendarsAction(practiceId: string, input: { calendarIds: string[] } | { useDefault: true }): Promise<ProfileActionResult> {
  const context = await requirePracticePermission(practiceId, "google:link-own");
  try {
    await saveBusyCalendars(context, "useDefault" in input ? { useDefault: true } : { calendarIds: input.calendarIds.map(String) });
  } catch (error) {
    return failure(error);
  }
  refresh();
  return { success: "Calendários salvos. Os bloqueios se atualizam em instantes." };
}

export async function setAllDayRuleAction(practiceId: string, value: boolean): Promise<ProfileActionResult> {
  const context = await requirePracticePermission(practiceId, "google:link-own");
  try {
    await setAllDayEventsBlock(context, value === true);
  } catch (error) {
    return failure(error);
  }
  refresh();
  return {};
}
