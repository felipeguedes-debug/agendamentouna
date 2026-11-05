"use server";

import { refresh } from "next/cache";
import type { Role } from "@/generated/prisma/enums";
import { requirePracticePermission } from "@/lib/auth/guard";
import { USERS_ERROR_TEXT, UsersError } from "@/lib/users/errors";
import { createInvitation, revokeInvitation } from "@/lib/users/invitations";
import { revokeMembership } from "@/lib/users/members";

export type ActionState = { error?: string; success?: string };

async function run(work: () => Promise<string>): Promise<ActionState> {
  try {
    const success = await work();
    refresh();
    return { success };
  } catch (error) {
    if (error instanceof UsersError) return { error: USERS_ERROR_TEXT[error.code] };
    throw error;
  }
}

export async function inviteUser(practiceId: string, _state: ActionState, formData: FormData): Promise<ActionState> {
  const context = await requirePracticePermission(practiceId, "users:invite");
  const email = String(formData.get("email") ?? "");
  return run(async () => {
    await createInvitation(context, {
      email,
      role: String(formData.get("role") ?? "") as Role,
      professionalId: String(formData.get("professionalId") ?? "") || null,
    });
    return `Convite enviado para ${email.trim().toLowerCase()}.`;
  });
}

export async function cancelInvitation(practiceId: string, invitationId: string): Promise<ActionState> {
  const context = await requirePracticePermission(practiceId, "users:invite");
  return run(async () => {
    await revokeInvitation(context, invitationId);
    return "Convite cancelado.";
  });
}

export async function removeMember(practiceId: string, membershipId: string): Promise<ActionState> {
  const context = await requirePracticePermission(practiceId, "users:manage");
  return run(async () => {
    await revokeMembership(context, membershipId);
    return "Acesso removido.";
  });
}
