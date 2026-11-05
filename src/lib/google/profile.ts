import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid, prisma } from "@/lib/db";
import { AgendaError } from "@/lib/agenda/errors";
import { requestConnectionSync } from "./queue";
import { busyCalendarIds } from "./rules";

/**
 * The professional's profile for Google (PRD 11, "Perfil do profissional"; D-23,
 * D-60): the link and its warnings for the manager and the professional (rule 6);
 * the calendars that count as busy and the all-day rule, which only the
 * professional sees and chooses: calendar names are the professional's own data.
 *
 * The connection and its calendars are read through the base client: they belong
 * to the person, not to the practice (D-04).
 */

export type GoogleLinkStatus = "none" | "active" | "revoked" | "error";

const STATUS: Record<"ACTIVE" | "REVOKED" | "ERROR", GoogleLinkStatus> = { ACTIVE: "active", REVOKED: "revoked", ERROR: "error" };

async function ownProfessional({ user, db }: PracticeContext) {
  return db.professional.findFirst({ where: { userId: user.id } });
}

async function connectionOf(connectionId: string | null) {
  if (!connectionId) return null;
  // Base client: see the module comment.
  return prisma.googleConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, email: true, status: true, statusChangedAt: true, lastSyncAt: true, calendars: { orderBy: [{ primary: "desc" }, { summary: "asc" }] } },
  });
}

export async function getGoogleProfile(context: PracticeContext, professionalId: string) {
  const { user, access, db } = context;
  const professional = isUuid(professionalId)
    ? await db.professional.findFirst({ where: { id: professionalId }, include: { secondaryCalendar: { select: { googleCalendarId: true } } } })
    : null;
  const own = Boolean(professional && professional.userId === user.id && can(access.role, "google:link-own"));
  const manager = can(access.role, "google:send-link");
  if (!manager && !own) throw new AgendaError("not_allowed", "Cannot see this profile");
  if (!professional) throw new AgendaError("professional_unavailable", "Professional not found");

  const connection = await connectionOf(professional.googleConnectionId);
  const ownSecondaryId = professional.secondaryCalendar?.googleCalendarId ?? null;
  const busy = new Set(
    connection
      ? busyCalendarIds({ calendars: connection.calendars, ownSecondaryId, chosen: professional.googleBusyCalendarsChosen, chosenIds: professional.googleBusyCalendarIds })
      : [],
  );
  const exportErrors = await db.appointment.count({ where: { professionalId: professional.id, googleSyncError: { not: null }, endsAt: { gt: new Date() } } });

  return {
    professional: { id: professional.id, name: professional.name, hasLogin: Boolean(professional.userId) },
    link: {
      status: connection ? STATUS[connection.status] : ("none" as GoogleLinkStatus),
      email: connection?.email ?? null,
      statusChangedAt: connection?.statusChangedAt ?? null,
      lastSyncAt: connection?.lastSyncAt ?? null,
      secondaryCalendarName: ownSecondaryId ? access.practiceName : null,
    },
    exportErrors,
    // Calendar names only for the professional (see the module comment).
    calendars:
      own && connection
        ? connection.calendars.map((calendar) => ({
            id: calendar.googleCalendarId,
            summary: calendar.summary,
            accessRole: calendar.accessRole,
            primary: calendar.primary,
            ownSecondary: calendar.googleCalendarId === ownSecondaryId,
            busy: busy.has(calendar.googleCalendarId),
          }))
        : null,
    busyChosen: professional.googleBusyCalendarsChosen,
    allDayEventsBlock: professional.allDayEventsBlock,
    canLink: own,
    canSendLink: manager,
    canUnlink: Boolean(connection) && (manager || own),
    canChooseCalendars: own && Boolean(connection),
  };
}

export type GoogleProfile = Awaited<ReturnType<typeof getGoogleProfile>>;

/** The practice's professionals and their Google link, for the manager (rule 6: the warnings). */
export async function listProfessionalsGoogle(context: PracticeContext) {
  if (!can(context.access.role, "google:send-link")) throw new AgendaError("not_allowed", "Cannot list the professionals");
  const professionals = await context.db.professional.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, userId: true, googleConnectionId: true, secondaryCalendar: { select: { id: true } } },
  });
  // Base client: see the module comment.
  const connections = await prisma.googleConnection.findMany({
    where: { id: { in: professionals.flatMap((professional) => (professional.googleConnectionId ? [professional.googleConnectionId] : [])) } },
    select: { id: true, email: true, status: true, lastSyncAt: true },
  });
  const byId = new Map(connections.map((connection) => [connection.id, connection]));
  return professionals.map((professional) => {
    const connection = professional.googleConnectionId ? byId.get(professional.googleConnectionId) : undefined;
    return {
      id: professional.id,
      name: professional.name,
      hasLogin: Boolean(professional.userId),
      status: connection ? STATUS[connection.status] : ("none" as GoogleLinkStatus),
      email: connection?.email ?? null,
      lastSyncAt: connection?.lastSyncAt ?? null,
      syncing: Boolean(connection) && !professional.secondaryCalendar,
    };
  });
}

/** Professionals of the practice whose Google link needs them again (rule 6), for the agenda's warning. */
export async function brokenGoogleLinks(context: PracticeContext) {
  if (!can(context.access.role, "google:send-link")) {
    const own = can(context.access.role, "google:link-own") ? await ownProfessional(context) : null;
    if (!own?.googleConnectionId) return [];
    const connection = await connectionOf(own.googleConnectionId);
    return connection && connection.status !== "ACTIVE" ? [{ id: own.id, name: own.name }] : [];
  }
  return (await listProfessionalsGoogle(context)).filter((row) => row.status === "revoked" || row.status === "error").map(({ id, name }) => ({ id, name }));
}

async function ownLinkedProfessional(context: PracticeContext) {
  if (!can(context.access.role, "google:link-own")) throw new AgendaError("not_allowed", "Only the professional chooses");
  const professional = await ownProfessional(context);
  if (!professional) throw new AgendaError("professional_unavailable", "No professional record");
  return professional;
}

/**
 * The calendars that count as busy (PRD 5, rule 1): the professional's list, or
 * back to the default (every calendar they can write to). This practice's own
 * secondary calendar never counts.
 */
export async function saveBusyCalendars(context: PracticeContext, input: { calendarIds: readonly string[] } | { useDefault: true }) {
  const { user, access, db } = context;
  const professional = await ownLinkedProfessional(context);
  const connection = await connectionOf(professional.googleConnectionId);
  if (!connection) throw new AgendaError("not_linked", "Google is not linked");
  const secondary = await db.googleSecondaryCalendar.findFirst({ where: { professionalId: professional.id }, select: { googleCalendarId: true } });
  const known = new Set(connection.calendars.map((calendar) => calendar.googleCalendarId));
  const data =
    "useDefault" in input
      ? { googleBusyCalendarsChosen: false, googleBusyCalendarIds: [] }
      : {
          googleBusyCalendarsChosen: true,
          googleBusyCalendarIds: [...new Set(input.calendarIds)].filter((id) => known.has(id) && id !== secondary?.googleCalendarId),
        };
  await db.$transaction(async (tx) => {
    await tx.professional.update({ where: { id: professional.id }, data });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "professional.google_busy_calendars", entityType: "Professional", entityId: professional.id, changedFields: ["googleBusyCalendarIds"] },
    });
  });
  await requestConnectionSync(connection.id);
}

/** All-day Google events block by default, since Google creates them free (D-15); the professional may turn that off. */
export async function setAllDayEventsBlock(context: PracticeContext, value: boolean) {
  const { user, access, db } = context;
  const professional = await ownLinkedProfessional(context);
  await db.$transaction(async (tx) => {
    await tx.professional.update({ where: { id: professional.id }, data: { allDayEventsBlock: value } });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "professional.google_all_day_rule", entityType: "Professional", entityId: professional.id, changedFields: ["allDayEventsBlock"] },
    });
  });
  if (professional.googleConnectionId) await requestConnectionSync(professional.googleConnectionId);
}
