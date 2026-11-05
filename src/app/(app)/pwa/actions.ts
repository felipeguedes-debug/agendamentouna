"use server";

import { redirect } from "next/navigation";
import { listProfessionalAccess } from "@/lib/auth/access";
import { getCurrentSession, LOGIN_PATH, requireUser } from "@/lib/auth/guard";
import { parsePushSubscription, removePushSubscription, savePushSubscription, syncPushSubscription } from "@/lib/push/subscriptions";

/**
 * The Web Push of this device (D-78). It hangs from the caller's session, whatever the
 * browser sends: nobody can subscribe or unsubscribe a session other than their own.
 */

async function currentOwner() {
  const user = await requireUser();
  const current = await getCurrentSession();
  if (!current) redirect(LOGIN_PATH);
  return { userId: user.id, sessionId: current.session.id, remembered: Boolean(current.session.rememberedDevice) };
}

export async function enablePushAction(subscription: unknown): Promise<{ error?: string }> {
  const { remembered, ...owner } = await currentOwner();
  if ((await listProfessionalAccess(owner.userId)).length === 0) return { error: "Os avisos são do profissional." };
  // A shorter session would end the notices without a word, 12 h after the last use (D-17).
  if (!remembered) return { error: "Mantenha este aparelho conectado para receber os avisos." };
  const target = parsePushSubscription(subscription);
  if (!target) return { error: "O navegador não entregou uma assinatura válida. Tente de novo." };
  await savePushSubscription(owner, target);
  return {};
}

export async function disablePushAction() {
  const { sessionId } = await currentOwner();
  await removePushSubscription({ sessionId });
}

/** What the screen asks when it opens: is this device hearing? */
export async function syncPushAction(subscription: unknown) {
  const { userId, sessionId } = await currentOwner();
  return syncPushSubscription({ userId, sessionId }, subscription ? parsePushSubscription(subscription) : null);
}
