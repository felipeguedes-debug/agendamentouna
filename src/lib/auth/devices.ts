import { prisma } from "@/lib/db";

/**
 * The devices of a user that stay signed in for 30 days (D-77), for the Security screen. A
 * lost phone keeps its session that long, so the person can end it from anywhere. Base
 * client: a session is not tied to a practice (D-35). Ending the session ends its Web Push
 * (foreign key with cascade, D-78).
 */

function deviceLabel(userAgent: string | null) {
  if (!userAgent) return "Aparelho";
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iPhone ou iPad";
  if (/Android/.test(userAgent)) return "Android";
  return "Computador";
}

export async function listRememberedDevices(userId: string, currentSessionId: string | undefined, now = new Date()) {
  const sessions = await prisma.session.findMany({
    where: { userId, rememberedDevice: true, expiresAt: { gt: now } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, userAgent: true, updatedAt: true },
  });
  return sessions.map((session) => ({ id: session.id, label: deviceLabel(session.userAgent), lastUsedAt: session.updatedAt, current: session.id === currentSessionId }));
}

/** Only among the user's own remembered sessions, whatever id arrives. */
export async function revokeRememberedDevice(userId: string, sessionId: string) {
  const { count } = await prisma.session.deleteMany({ where: { id: sessionId, userId, rememberedDevice: true } });
  return count > 0;
}
