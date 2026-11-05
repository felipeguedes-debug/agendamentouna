import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { forPractice, isUuid, prisma, type PracticeTransaction } from "@/lib/db";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { AgendaError } from "@/lib/agenda/errors";
import { CANCELED_STATUSES } from "@/lib/appointments/status";
import { googleProviderFor, type GoogleSyncOptions } from "./index";
import { GoogleError, isGoogleError, type GoogleCalendarApi } from "./provider";

/**
 * The Google link itself (PRD 5, Vínculo and rule 6; D-01, D-04, D-59, D-60): the
 * access token, the calendar list, the secondary calendar of each practice, and
 * unlinking. A connection serves the professionals of the same person in several
 * practices, so this service reads connections and calendars through the base
 * client; what belongs to a practice is written through that practice's scoped
 * client.
 */

/** Refresh the access token when less than this is left. */
const ACCESS_TOKEN_MARGIN_MS = 60_000;

/** Google refused the grant: the agenda goes on without Google until the professional links again (rule 6). */
export async function markConnectionRevoked(connectionId: string, reason: string, now = new Date()) {
  // Base client: the connection belongs to no practice.
  await prisma.googleConnection.updateMany({
    where: { id: connectionId, status: "ACTIVE" },
    data: { status: "REVOKED", statusChangedAt: now, lastError: reason.slice(0, 200), accessTokenEncrypted: null, accessTokenExpiresAt: null },
  });
}

/** A call failed with "auth": drop the cached access token, so the next call refreshes it (or finds the grant revoked). */
export async function forgetAccessToken(connectionId: string) {
  await prisma.googleConnection.update({ where: { id: connectionId }, data: { accessTokenEncrypted: null, accessTokenExpiresAt: null } });
}

/**
 * The calendar API for the connection, with an access token from the cache or a
 * refresh. A refresh Google refuses marks the connection revoked. Only active
 * connections are used.
 */
export async function googleApiFor(connectionId: string, options: GoogleSyncOptions = {}): Promise<GoogleCalendarApi> {
  const now = options.now ?? new Date();
  // Base client: see the module comment.
  const connection = await prisma.googleConnection.findUnique({ where: { id: connectionId } });
  if (!connection || connection.status !== "ACTIVE") throw new GoogleError("auth", "The Google link is not active");
  const provider = options.provider ?? googleProviderFor(connection.googleSubject);

  if (connection.accessTokenEncrypted && connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() - now.getTime() > ACCESS_TOKEN_MARGIN_MS) {
    try {
      return provider.calendar(decryptSecret(connection.accessTokenEncrypted));
    } catch {
      // Another key or a damaged value: refresh below.
    }
  }
  let refreshToken: string;
  try {
    refreshToken = decryptSecret(connection.refreshTokenEncrypted);
  } catch {
    await markConnectionRevoked(connectionId, "refresh_token_unreadable", now);
    throw new GoogleError("auth", "The refresh token does not decrypt");
  }
  try {
    const fresh = await provider.refreshAccessToken(refreshToken);
    await prisma.googleConnection.update({
      where: { id: connectionId },
      data: { accessTokenEncrypted: encryptSecret(fresh.accessToken), accessTokenExpiresAt: fresh.expiresAt },
    });
    return provider.calendar(fresh.accessToken);
  } catch (error) {
    if (isGoogleError(error, "auth")) await markConnectionRevoked(connectionId, error.message, now);
    throw error;
  }
}

/** Stops a push channel at Google; a channel that is already gone is fine. */
export async function stopChannel(api: GoogleCalendarApi | null, calendar: { channelId: string | null; channelResourceId: string | null }) {
  if (!api || !calendar.channelId || !calendar.channelResourceId) return;
  try {
    await api.stopChannel({ id: calendar.channelId, resourceId: calendar.channelResourceId });
  } catch (error) {
    if (!isGoogleError(error, "not_found")) console.warn(`Could not stop Google channel ${calendar.channelId}`, (error as Error).message);
  }
}

/** Mirrors the connection's calendar list (names and access) for the busy choice (PRD 5, rule 1). */
export async function refreshCalendarList(connectionId: string, options: GoogleSyncOptions = {}) {
  const api = await googleApiFor(connectionId, options);
  const entries = await api.listCalendars();
  const listed = new Set(entries.map((entry) => entry.id));
  // Base client: the calendars belong to the connection, not to a practice.
  for (const entry of entries) {
    await prisma.googleCalendar.upsert({
      where: { googleConnectionId_googleCalendarId: { googleConnectionId: connectionId, googleCalendarId: entry.id } },
      create: { googleConnectionId: connectionId, googleCalendarId: entry.id, summary: entry.summary, accessRole: entry.accessRole, primary: entry.primary },
      update: { summary: entry.summary, accessRole: entry.accessRole, primary: entry.primary },
    });
  }
  const gone = await prisma.googleCalendar.findMany({ where: { googleConnectionId: connectionId, googleCalendarId: { notIn: [...listed] } } });
  for (const calendar of gone) await stopChannel(api, calendar);
  await prisma.googleCalendar.deleteMany({ where: { id: { in: gone.map((calendar) => calendar.id) } } });
  return entries.length;
}

/** Appointments whose event should exist from now on: not canceled, not rescheduled, not over. */
function exportableWhere(professionalId: string, now: Date) {
  return { professionalId, endsAt: { gt: now }, status: { notIn: [...CANCELED_STATUSES, "RESCHEDULED" as const] } };
}

/**
 * Creates the secondary calendar, named after the practice, for each professional
 * of the connection that has none yet (PRD 5, Vínculo), and marks their future
 * appointments for export, imported ones included (PRD 5, rule 7; D-18).
 * Returns how many calendars it created.
 */
export async function ensureSecondaryCalendars(connectionId: string, options: GoogleSyncOptions = {}) {
  const now = options.now ?? new Date();
  // Base client: the professionals of one person across practices (D-04).
  const professionals = await prisma.professional.findMany({
    where: { googleConnectionId: connectionId, active: true, secondaryCalendar: { is: null } },
    select: { id: true, practiceId: true, practice: { select: { name: true } } },
  });
  if (professionals.length === 0) return 0;
  const api = await googleApiFor(connectionId, options);
  if ((await prisma.googleCalendar.count({ where: { googleConnectionId: connectionId } })) === 0) await refreshCalendarList(connectionId, options);

  for (const professional of professionals) {
    const db = forPractice(professional.practiceId);
    const { id: googleCalendarId } = await api.createCalendar({ summary: professional.practice.name, timeZone: await agendaTimeZone(db) });
    await prisma.googleCalendar.upsert({
      where: { googleConnectionId_googleCalendarId: { googleConnectionId: connectionId, googleCalendarId } },
      create: { googleConnectionId: connectionId, googleCalendarId, summary: professional.practice.name, accessRole: "owner" },
      update: {},
    });
    await db.$transaction(async (tx) => {
      await tx.googleSecondaryCalendar.create({ data: { practiceId: professional.practiceId, professionalId: professional.id, googleConnectionId: connectionId, googleCalendarId } });
      await tx.appointment.updateMany({
        where: exportableWhere(professional.id, now),
        data: { googleSyncRequestedAt: now, googleEventId: null, googleEventUpdatedAt: null, googleSyncError: null, googleSyncAttempts: 0 },
      });
    });
  }
  return professionals.length;
}

/** The secondary calendar went: manual blocks lose their events, and removed ones have nothing left to wait for (D-85). */
export async function forgetManualBlockEvents(tx: PracticeTransaction, professionalId: string) {
  await tx.timeBlock.deleteMany({ where: { professionalId, source: "MANUAL", deletedAt: { not: null } } });
  await tx.timeBlock.updateMany({
    where: { professionalId, source: "MANUAL" },
    data: { googleCalendarId: null, googleEventId: null, googleSyncRequestedAt: null, googleSyncAttempts: 0, googleSyncError: null },
  });
}

/**
 * Takes the professional off their Google calendars in this practice: the Google
 * blocks, the secondary calendar's row, the open pending changes and the events'
 * ids go. Returns the secondary calendar's Google id, to delete it at Google.
 */
export async function detachProfessional(tx: PracticeTransaction, professionalId: string, now: Date) {
  await tx.timeBlock.deleteMany({ where: { professionalId, source: "GOOGLE" } });
  await forgetManualBlockEvents(tx, professionalId);
  await tx.pendingGoogleChange.updateMany({ where: { resolvedAt: null, appointment: { is: { professionalId } } }, data: { resolution: "SUPERSEDED", resolvedAt: now } });
  await tx.appointment.updateMany({
    where: { professionalId, OR: [{ googleEventId: { not: null } }, { googleSyncRequestedAt: { not: null } }] },
    data: { googleEventId: null, googleSyncRequestedAt: null, googleEventUpdatedAt: null, googleSyncError: null, googleSyncAttempts: 0 },
  });
  const secondary = await tx.googleSecondaryCalendar.findFirst({ where: { professionalId } });
  if (secondary) await tx.googleSecondaryCalendar.delete({ where: { id: secondary.id } });
  return secondary?.googleCalendarId ?? null;
}

/** Revokes and deletes a connection no professional uses any more. */
export async function dropConnectionIfUnused(connectionId: string, options: GoogleSyncOptions = {}) {
  // Base client: whether any practice still uses the connection.
  if ((await prisma.professional.count({ where: { googleConnectionId: connectionId } })) > 0) return false;
  const connection = await prisma.googleConnection.findUnique({ where: { id: connectionId }, include: { calendars: true } });
  if (!connection) return false;
  const provider = options.provider ?? googleProviderFor(connection.googleSubject);
  let api: GoogleCalendarApi | null = null;
  if (connection.status === "ACTIVE") {
    try {
      api = await googleApiFor(connectionId, { ...options, provider });
    } catch {
      api = null;
    }
  }
  for (const calendar of connection.calendars) await stopChannel(api, calendar);
  try {
    await provider.revoke(decryptSecret(connection.refreshTokenEncrypted));
  } catch (error) {
    console.warn(`Could not revoke Google connection ${connectionId}`, (error as Error).message);
  }
  await prisma.googleConnection.delete({ where: { id: connectionId } });
  return true;
}

/**
 * Unlinks the professional's Google in this practice (D-59): the professional for
 * their own record, or the manager. The calendar the app created is deleted at
 * Google too, so the patients' first names leave the professional's Google; the
 * connection goes when no practice uses it any more.
 */
export async function unlinkGoogle(context: PracticeContext, professionalId: string, options: GoogleSyncOptions = {}) {
  const { user, access, db } = context;
  const now = options.now ?? new Date();
  const professional = isUuid(professionalId) ? await db.professional.findFirst({ where: { id: professionalId } }) : null;
  const own = Boolean(professional && professional.userId === user.id);
  if (!can(access.role, "google:send-link") && !(can(access.role, "google:link-own") && own)) throw new AgendaError("not_allowed", "Cannot unlink Google");
  if (!professional) throw new AgendaError("professional_unavailable", "Professional not found");
  const connectionId = professional.googleConnectionId;
  if (!connectionId) throw new AgendaError("not_linked", "Google is not linked");

  const secondaryId = await db.$transaction(async (tx) => {
    const id = await detachProfessional(tx, professional.id, now);
    await tx.professional.update({ where: { id: professional.id }, data: { googleConnectionId: null, googleBusyCalendarIds: [], googleBusyCalendarsChosen: false } });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "professional.google_unlinked", entityType: "Professional", entityId: professional.id, changedFields: ["googleConnectionId"] },
    });
    return id;
  });

  if (secondaryId) {
    try {
      await (await googleApiFor(connectionId, options)).deleteCalendar(secondaryId);
      await prisma.googleCalendar.deleteMany({ where: { googleConnectionId: connectionId, googleCalendarId: secondaryId } });
    } catch (error) {
      console.warn(`Could not delete the secondary calendar of professional ${professional.id}`, (error as Error).message);
    }
  }
  await dropConnectionIfUnused(connectionId, options);
}
