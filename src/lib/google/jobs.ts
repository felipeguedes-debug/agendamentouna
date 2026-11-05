import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sameSecret } from "@/lib/crypto/secrets";
import { forPractice, prisma } from "@/lib/db";
import { ensureSecondaryCalendars, googleApiFor, refreshCalendarList, stopChannel } from "./connection";
import { calendarsInUse, loadPlans, syncConnectionCalendars, syncGoogleCalendar } from "./inbound";
import { googleWebhookAddress, type GoogleSyncOptions } from "./index";
import { exportAppointments } from "./outbound";
import { isGoogleError } from "./provider";
import { markForGoogleSync } from "./queue";

/**
 * The Google work across practices, for the Inngest functions (src/lib/inngest):
 * the export sweep, the sync of a connection (polling every 4 minutes, or at once
 * after a link), the push channels and the daily upkeep (D-61, D-62). They read
 * connections and the queue through the base client, since they run for the whole
 * system; each practice's rows are then handled through its scoped client.
 */

/** A channel lives up to 7 days; the daily upkeep opens a new one when less than 2 are left. */
const CHANNEL_TTL_MS = 7 * 86_400_000;
const CHANNEL_RENEW_MS = 2 * 86_400_000;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Practices with appointments marked for export on an active connection (the minute tick). */
export async function practicesToExport() {
  // Base client: the sweep looks at every practice's queue.
  const where = { googleSyncRequestedAt: { not: null }, professional: { is: { googleConnection: { is: { status: "ACTIVE" as const } } } } };
  const [appointments, blocks] = await Promise.all([prisma.appointment.groupBy({ by: ["practiceId"], where }), prisma.timeBlock.groupBy({ by: ["practiceId"], where })]);
  return [...new Set([...appointments, ...blocks].map((group) => group.practiceId))];
}

export async function activeConnectionIds() {
  // Base client: connections belong to no practice.
  return (await prisma.googleConnection.findMany({ where: { status: "ACTIVE" }, select: { id: true } })).map((row) => row.id);
}

/**
 * Opens a push channel for every calendar in use that has none (or one about to
 * expire) and stops the channels of calendars no longer read. Without a public
 * HTTPS address (PUBLIC_WEBHOOK_URL, D-24) only the polling runs.
 */
export async function ensureWatchChannels(connectionId: string, options: GoogleSyncOptions = {}) {
  const address = googleWebhookAddress();
  if (!address) return 0;
  const now = options.now ?? new Date();
  const loaded = await loadPlans(connectionId);
  if (!loaded) return 0;
  const inUse = calendarsInUse(loaded.plans);
  const api = await googleApiFor(connectionId, options);
  let opened = 0;
  for (const calendar of loaded.connection.calendars) {
    if (!inUse.has(calendar.googleCalendarId)) {
      if (calendar.channelId) {
        await stopChannel(api, calendar);
        await prisma.googleCalendar.update({ where: { id: calendar.id }, data: { channelId: null, channelResourceId: null, channelTokenHash: null, channelExpiresAt: null } });
      }
      continue;
    }
    if (calendar.channelId && calendar.channelExpiresAt && calendar.channelExpiresAt.getTime() - now.getTime() > CHANNEL_RENEW_MS) continue;
    const channel = { id: randomUUID(), token: randomBytes(32).toString("base64url"), address, expiresAt: new Date(now.getTime() + CHANNEL_TTL_MS) };
    try {
      const watched = await api.watchEvents(calendar.googleCalendarId, channel);
      // The new channel first: the old one may overlap for a moment, as Google allows.
      await prisma.googleCalendar.update({
        where: { id: calendar.id },
        data: { channelId: channel.id, channelResourceId: watched.resourceId, channelTokenHash: hash(channel.token), channelExpiresAt: watched.expiresAt },
      });
      await stopChannel(api, calendar);
      opened += 1;
    } catch (error) {
      if (!isGoogleError(error)) throw error;
      console.warn(`Could not watch Google calendar ${calendar.googleCalendarId}`, error.message);
    }
  }
  return opened;
}

/**
 * A connection's sync: secondary calendars for professionals who have none (a new
 * link, a calendar deleted in Google), the export of their practices, the calendar
 * list, the push channels and the read of the calendars. The polling reads only the calendars
 * no push read in the last minutes; `full` reads them all.
 */
export async function runConnectionSync(connectionId: string, options: GoogleSyncOptions & { full?: boolean } = {}) {
  try {
    if ((await ensureSecondaryCalendars(connectionId, options)) > 0) {
      // Base client: the practices of the connection's professionals.
      const practices = await prisma.professional.findMany({ where: { googleConnectionId: connectionId }, distinct: ["practiceId"], select: { practiceId: true } });
      for (const { practiceId } of practices) await exportAppointments(practiceId, options);
    }
    // A calendar created in Google counts from this read on (D-60).
    await refreshCalendarList(connectionId, options);
    await ensureWatchChannels(connectionId, options);
  } catch (error) {
    // Revoked meanwhile, or Google unreachable: the next run tries again.
    if (!isGoogleError(error)) throw error;
    console.warn(`Google setup of connection ${connectionId} stopped (${error.kind}): ${error.message}`);
  }
  return syncConnectionCalendars(connectionId, { ...options, onlyStale: !options.full });
}

/**
 * Once a day: the calendar list (names, new calendars), the channels about to
 * expire, and the events of erased patients synced before the erasure (D-28),
 * marked again so they lose the first name.
 */
export async function dailyGoogleUpkeep(options: GoogleSyncOptions = {}) {
  for (const connectionId of await activeConnectionIds()) {
    try {
      await refreshCalendarList(connectionId, options);
      await ensureWatchChannels(connectionId, options);
    } catch (error) {
      if (!isGoogleError(error)) throw error;
      console.warn(`Daily Google upkeep of connection ${connectionId} stopped (${error.kind}): ${error.message}`);
    }
  }
  // Base client: erased patients of every practice.
  const stale = await prisma.appointment.findMany({
    where: { googleEventId: { not: null }, googleSyncRequestedAt: null, patient: { is: { anonymizedAt: { not: null } } } },
    select: { id: true, practiceId: true, googleSyncedAt: true, patient: { select: { anonymizedAt: true } } },
  });
  const byPractice = new Map<string, string[]>();
  for (const row of stale) {
    if (row.googleSyncedAt && row.patient.anonymizedAt && row.googleSyncedAt >= row.patient.anonymizedAt) continue;
    byPractice.set(row.practiceId, [...(byPractice.get(row.practiceId) ?? []), row.id]);
  }
  for (const [practiceId, ids] of byPractice) await markForGoogleSync(forPractice(practiceId), ids, options.now);
  return [...byPractice.values()].reduce((total, ids) => total + ids.length, 0);
}

export type PushOutcome = { status: 200 | 400 | 401 | 404; calendar?: { id: string; connectionId: string } };

/**
 * A push from Google (D-61): the channel id finds the calendar and the channel
 * token, compared in constant time with the stored hash, proves it is ours. The
 * first message of a channel ("sync") needs no read.
 */
export async function checkGooglePush(headers: Headers): Promise<PushOutcome> {
  const channelId = headers.get("x-goog-channel-id");
  const state = headers.get("x-goog-resource-state");
  if (!channelId || !state) return { status: 400 };
  // Base client: the channel identifies a calendar of a connection, of no practice.
  const calendar = await prisma.googleCalendar.findUnique({ where: { channelId }, select: { id: true, googleConnectionId: true, channelTokenHash: true } });
  if (!calendar?.channelTokenHash) return { status: 404 };
  const token = headers.get("x-goog-channel-token");
  if (!token || !sameSecret(hash(token), calendar.channelTokenHash)) return { status: 401 };
  return state === "sync" ? { status: 200 } : { status: 200, calendar: { id: calendar.id, connectionId: calendar.googleConnectionId } };
}

export { syncGoogleCalendar };
