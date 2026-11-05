import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/db";
import type { PushTarget } from "./provider";

/**
 * The Web Push of each device (D-78). A subscription hangs from the session that turned it
 * on, so signing out or revoking that session ends it in the database (foreign key with
 * cascade). A device belongs to no practice, so everything here uses the base client, by
 * session and user, never by a practice.
 */

const MAX_ENDPOINT = 2048;
const MAX_KEY = 512;
const KEY_FORMAT = /^[A-Za-z0-9_-]+={0,2}$/;

export function hashEndpoint(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

/** What the browser's PushSubscription.toJSON() gives; anything else is refused. */
export function parsePushSubscription(input: unknown): PushTarget | null {
  const { endpoint, keys } = (input ?? {}) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT || !endpoint.startsWith("https://")) return null;
  const { p256dh, auth } = keys ?? {};
  if (typeof p256dh !== "string" || p256dh.length > MAX_KEY || !KEY_FORMAT.test(p256dh)) return null;
  if (typeof auth !== "string" || auth.length > MAX_KEY || !KEY_FORMAT.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

export function decryptTarget(keysEncrypted: string): PushTarget | null {
  try {
    return parsePushSubscription(JSON.parse(decryptSecret(keysEncrypted)));
  } catch {
    return null;
  }
}

function rowOf(target: PushTarget) {
  return { endpointHash: hashEndpoint(target.endpoint), keysEncrypted: encryptSecret(JSON.stringify({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } })) };
}

/**
 * Turns the notices on for this session. A browser has one subscription per site, so it
 * may arrive already known: the same phone after another login moves to the new session,
 * and whoever had it stops hearing there.
 */
export async function savePushSubscription(owner: { userId: string; sessionId: string }, target: PushTarget) {
  const row = rowOf(target);
  await prisma.$transaction([
    prisma.pushSubscription.deleteMany({ where: { sessionId: owner.sessionId, endpointHash: { not: row.endpointHash } } }),
    prisma.pushSubscription.upsert({ where: { endpointHash: row.endpointHash }, create: { ...owner, ...row }, update: { ...owner, ...row } }),
  ]);
}

export async function removePushSubscription(owner: { sessionId: string }) {
  await prisma.pushSubscription.deleteMany({ where: { sessionId: owner.sessionId } });
}

/**
 * What the screen does when it opens: the server's word and the browser's may have drifted
 * apart. The browser rotated the subscription: keep the new one. The browser lost it (site
 * data cleared): off. No row for this session (signed in again): off, until the person asks.
 */
export async function syncPushSubscription(owner: { userId: string; sessionId: string }, target: PushTarget | null) {
  const row = await prisma.pushSubscription.findFirst({ where: { sessionId: owner.sessionId }, select: { id: true, endpointHash: true } });
  if (!row) return false;
  if (!target) {
    await removePushSubscription(owner);
    return false;
  }
  if (row.endpointHash !== hashEndpoint(target.endpoint)) await savePushSubscription(owner, target);
  return true;
}

/** Sessions that ended by time, which nobody deleted, take their subscriptions along. */
export async function pruneExpiredSubscriptions(now = new Date()) {
  const { count } = await prisma.pushSubscription.deleteMany({ where: { session: { expiresAt: { lte: now } } } });
  return count;
}
