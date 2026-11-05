import { getPracticeAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { forPractice, prisma } from "@/lib/db";
import { allowedPushUsers, pushProvider, type PushProvider } from "./index";
import { confirmationPushBody, PUSH_TITLE, pushTtlSeconds } from "./rules";
import { decryptTarget } from "./subscriptions";

/**
 * Sends the confirmation notices of one practice (D-78). Each mark is taken before sending,
 * so a notice goes out at most once: if the push service fails, that device loses it and
 * the agenda still shows the confirmation. Whoever the notice would reach is checked at
 * the last moment: a live session and access to the practice today.
 */

const BATCH = 100;

/** A device of someone who can still see this agenda. Base client: a device belongs to no practice. */
async function devicesOf(userId: string, practiceId: string, now: Date) {
  const access = await getPracticeAccess(userId, practiceId);
  if (!access || !(can(access.role, "agenda:view") || can(access.role, "agenda:view-own"))) return [];
  const allowed = allowedPushUsers();
  const rows = await prisma.pushSubscription.findMany({
    where: { userId, session: { expiresAt: { gt: now } } },
    select: { id: true, keysEncrypted: true, user: { select: { email: true } } },
  });
  return rows.filter((row) => !allowed || allowed.includes(row.user.email.toLowerCase()));
}

export async function sendConfirmationPushes(practiceId: string, options: { now?: Date; provider?: PushProvider } = {}) {
  const now = options.now ?? new Date();
  const db = forPractice(practiceId);
  const provider = options.provider ?? pushProvider();
  const rows = await db.appointment.findMany({
    where: { pushRequestedAt: { not: null } },
    orderBy: { pushRequestedAt: "asc" },
    take: BATCH,
    select: { id: true, status: true, startsAt: true, pushRequestedAt: true, location: { select: { timeZone: true } }, professional: { select: { userId: true } } },
  });
  let sent = 0;
  for (const row of rows) {
    const { count } = await db.appointment.updateMany({ where: { id: row.id, pushRequestedAt: row.pushRequestedAt }, data: { pushRequestedAt: null } });
    if (count === 0) continue;
    // The appointment moved on while waiting in the queue: there is nothing left to tell.
    const userId = row.professional.userId;
    if (!userId || row.status !== "CONFIRMED" || row.startsAt <= now) continue;

    const message = {
      title: PUSH_TITLE,
      body: confirmationPushBody(row.startsAt, row.location.timeZone, now),
      url: `/pwa/${practiceId}`,
      tag: `confirmacao-${row.id}`,
      ttlSeconds: pushTtlSeconds(row.startsAt, now),
    };
    for (const device of await devicesOf(userId, practiceId, now)) {
      const target = decryptTarget(device.keysEncrypted);
      try {
        // Keys that no longer decrypt are as good as gone.
        const outcome = target ? await provider.send(target, message) : "gone";
        if (outcome === "gone") await prisma.pushSubscription.deleteMany({ where: { id: device.id } });
        else sent += 1;
      } catch (error) {
        console.warn(`Push notice lost for one device of practice ${practiceId}:`, (error as Error).message);
      }
    }
  }
  return { sent, more: rows.length === BATCH };
}

/** For the minute tick. Base client: the tick crosses practices by definition. */
export async function practicesWithPendingPush() {
  const rows = await prisma.appointment.findMany({ where: { pushRequestedAt: { not: null } }, distinct: ["practiceId"], select: { practiceId: true } });
  return rows.map((row) => ({ practiceId: row.practiceId }));
}
