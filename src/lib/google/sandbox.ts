import { randomUUID } from "node:crypto";
import type { SandboxGoogleEvent } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { addDays, zonedToUtc, type IsoDate } from "@/lib/dates/zoned";
import {
  CALENDAR_SCOPES,
  GoogleError,
  LINK_SCOPES,
  type CalendarEntry,
  type EventInput,
  type GoogleCalendarApi,
  type GoogleCalendarProvider,
  type GoogleEvent,
} from "./provider";

/**
 * The fake Google of PRD 12 ("Sandbox dos provedores"; D-58): calendars and
 * events of fake Google accounts in the SandboxGoogle tables, so the link, the
 * export and the reading run end to end without Google, in tests, in development
 * and in the end-to-end flows. Not available in production (./index.ts).
 *
 * It reads and writes through the base client: like Google, it belongs to no
 * practice. The consent screen is /google/sandbox, where the developer types the
 * account; tokens are plain strings naming the account.
 */

export const SANDBOX_CONSENT_PATH = "/google/sandbox";

const REFRESH_PREFIX = "sandbox-refresh:";
const ACCESS_PREFIX = "sandbox-access:";
const WRITABLE = new Set(["owner", "writer"]);
const HOUR_MS = 3_600_000;

export const SANDBOX_SUBJECT_PREFIX = "sandbox-";

export function sandboxSubject(email: string) {
  return `${SANDBOX_SUBJECT_PREFIX}${email.trim().toLowerCase()}`;
}

export function sandboxRefreshToken(subject: string) {
  return `${REFRESH_PREFIX}${subject}`;
}

/** What /google/sandbox sends back to the callback for the account typed there. */
export function sandboxConsentCode(email: string) {
  return `sandbox:${email.trim().toLowerCase()}`;
}

/** The fake account and its primary calendar, whose id is the e-mail, as in Google. */
export async function ensureSandboxAccount(email: string) {
  const normalized = email.trim().toLowerCase();
  const subject = sandboxSubject(normalized);
  await prisma.sandboxGoogleCalendar.upsert({
    where: { calendarId: normalized },
    create: { accountSubject: subject, calendarId: normalized, summary: normalized, accessRole: "owner", primary: true },
    update: {},
  });
  return { subject, primaryCalendarId: normalized };
}

export async function addSandboxCalendar(subject: string, input: { summary: string; accessRole?: string }) {
  const calendarId = `sandbox-${randomUUID()}@group.calendar.google.com`;
  await prisma.sandboxGoogleCalendar.create({ data: { accountSubject: subject, calendarId, summary: input.summary, accessRole: input.accessRole ?? "owner" } });
  return calendarId;
}

/** The account's calendars and how many events each holds (cancelled included). */
export async function sandboxCalendarsOf(subject: string) {
  const calendars = await prisma.sandboxGoogleCalendar.findMany({ where: { accountSubject: subject }, include: { _count: { select: { events: true } } }, orderBy: { createdAt: "asc" } });
  return calendars.map(({ _count, ...calendar }) => ({ ...calendar, events: _count.events }));
}

export type SandboxEventInput = {
  eventId?: string;
  /** A timed event... */
  start?: Date;
  end?: Date;
  /** ...or an all-day one, end exclusive. */
  date?: string;
  endDate?: string;
  summary?: string;
  transparency?: "opaque" | "transparent";
  eventType?: string;
  declined?: boolean;
};

/** An event someone creates in Google. */
export async function putSandboxEvent(calendarId: string, input: SandboxEventInput) {
  const eventId = input.eventId ?? randomUUID().replace(/-/g, "");
  await prisma.sandboxGoogleEvent.create({
    data: {
      calendarId,
      eventId,
      summary: input.summary ?? "Compromisso",
      startsAt: input.start ?? null,
      endsAt: input.end ?? null,
      startDate: input.date ?? null,
      // As Google, an all-day event always has its end: the next day unless given.
      endDate: input.endDate ?? (input.date ? addDays(input.date as IsoDate, 1) : null),
      transparency: input.transparency ?? "opaque",
      eventType: input.eventType ?? "default",
      declined: input.declined ?? false,
    },
  });
  return eventId;
}

/** Google's "updated" always moves forward, even within one millisecond of the last write. */
async function nextUpdate(calendarId: string, eventId: string) {
  const current = await prisma.sandboxGoogleEvent.findUniqueOrThrow({ where: { calendarId_eventId: { calendarId, eventId } }, select: { updatedAt: true } });
  return new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
}

/** Someone drags the event in Google. */
export async function moveSandboxEvent(calendarId: string, eventId: string, times: { start: Date; end: Date }) {
  await prisma.sandboxGoogleEvent.update({
    where: { calendarId_eventId: { calendarId, eventId } },
    data: { startsAt: times.start, endsAt: times.end, startDate: null, endDate: null, updatedAt: await nextUpdate(calendarId, eventId) },
  });
}

/** Someone deletes the event in Google: it stays as "cancelled", as Google keeps it. */
export async function deleteSandboxEvent(calendarId: string, eventId: string) {
  await prisma.sandboxGoogleEvent.update({
    where: { calendarId_eventId: { calendarId, eventId } },
    data: { status: "cancelled", updatedAt: await nextUpdate(calendarId, eventId) },
  });
}

export async function sandboxEvent(calendarId: string, eventId: string) {
  return prisma.sandboxGoogleEvent.findUnique({ where: { calendarId_eventId: { calendarId, eventId } } });
}

function toGoogleEvent(row: SandboxGoogleEvent): GoogleEvent {
  return {
    id: row.eventId,
    status: row.status as GoogleEvent["status"],
    updated: row.updatedAt,
    start: row.startDate ? { date: row.startDate } : row.startsAt ? { dateTime: row.startsAt } : null,
    end: row.startDate ? { date: row.endDate ?? row.startDate } : row.endsAt ? { dateTime: row.endsAt } : null,
    transparency: row.transparency === "transparent" ? "transparent" : "opaque",
    eventType: row.eventType,
    declinedBySelf: row.declined,
    appointmentId: row.appointmentId,
  };
}

function eventData(input: EventInput) {
  return {
    status: "confirmed",
    summary: input.summary,
    description: input.description,
    location: input.location,
    startsAt: input.start,
    endsAt: input.end,
    startDate: null,
    endDate: null,
    transparency: "opaque",
    eventType: "default",
    appointmentId: input.appointmentId,
  };
}

class SandboxCalendarApi implements GoogleCalendarApi {
  constructor(private readonly subject: string) {}

  private async calendarOf(calendarId: string, write = false) {
    const calendar = await prisma.sandboxGoogleCalendar.findUnique({ where: { calendarId } });
    if (!calendar || calendar.accountSubject !== this.subject) throw new GoogleError("not_found", `Calendar ${calendarId} not found`);
    if (write && !WRITABLE.has(calendar.accessRole)) throw new GoogleError("rejected", `No write access to ${calendarId}`);
    return calendar;
  }

  async listCalendars(): Promise<CalendarEntry[]> {
    const calendars = await prisma.sandboxGoogleCalendar.findMany({ where: { accountSubject: this.subject }, orderBy: { createdAt: "asc" } });
    return calendars.map((calendar) => ({ id: calendar.calendarId, summary: calendar.summary, accessRole: calendar.accessRole, primary: calendar.primary }));
  }

  async createCalendar(input: { summary: string; timeZone: string }) {
    const calendarId = `sandbox-${randomUUID()}@group.calendar.google.com`;
    await prisma.sandboxGoogleCalendar.create({ data: { accountSubject: this.subject, calendarId, summary: input.summary, timeZone: input.timeZone, accessRole: "owner" } });
    return { id: calendarId };
  }

  async deleteCalendar(calendarId: string) {
    await this.calendarOf(calendarId, true);
    await prisma.sandboxGoogleCalendar.delete({ where: { calendarId } });
  }

  async listEvents(calendarId: string, window: { timeMin: Date; timeMax: Date }) {
    const calendar = await this.calendarOf(calendarId);
    const rows = await prisma.sandboxGoogleEvent.findMany({ where: { calendarId, status: { not: "cancelled" } }, orderBy: { createdAt: "asc" } });
    // As Google: the event ends after timeMin and starts before timeMax.
    return rows
      .filter((row) => {
        const start = row.startDate ? zonedToUtc(row.startDate as IsoDate, "00:00", calendar.timeZone) : row.startsAt;
        const end = row.endDate ? zonedToUtc(row.endDate as IsoDate, "00:00", calendar.timeZone) : row.endsAt;
        return start && end && end > window.timeMin && start < window.timeMax;
      })
      .map((row) => toGoogleEvent(row));
  }

  async getEvent(calendarId: string, eventId: string) {
    await this.calendarOf(calendarId);
    const row = await prisma.sandboxGoogleEvent.findUnique({ where: { calendarId_eventId: { calendarId, eventId } } });
    return row ? toGoogleEvent(row) : null;
  }

  async insertEvent(calendarId: string, eventId: string, input: EventInput) {
    await this.calendarOf(calendarId, true);
    if (await prisma.sandboxGoogleEvent.findUnique({ where: { calendarId_eventId: { calendarId, eventId } } })) {
      throw new GoogleError("conflict", `Event ${eventId} already exists`);
    }
    const row = await prisma.sandboxGoogleEvent.create({ data: { calendarId, eventId, ...eventData(input) } });
    return toGoogleEvent(row);
  }

  async patchEvent(calendarId: string, eventId: string, input: EventInput) {
    await this.calendarOf(calendarId, true);
    if (!(await prisma.sandboxGoogleEvent.findUnique({ where: { calendarId_eventId: { calendarId, eventId } } }))) {
      throw new GoogleError("not_found", `Event ${eventId} not found`);
    }
    const row = await prisma.sandboxGoogleEvent.update({
      where: { calendarId_eventId: { calendarId, eventId } },
      data: { ...eventData(input), updatedAt: await nextUpdate(calendarId, eventId) },
    });
    return toGoogleEvent(row);
  }

  async deleteEvent(calendarId: string, eventId: string) {
    await this.calendarOf(calendarId, true);
    const row = await prisma.sandboxGoogleEvent.findUnique({ where: { calendarId_eventId: { calendarId, eventId } } });
    if (!row || row.status === "cancelled") throw new GoogleError("not_found", `Event ${eventId} not found`);
    await deleteSandboxEvent(calendarId, eventId);
  }

  async watchEvents(calendarId: string, channel: { expiresAt: Date }) {
    await this.calendarOf(calendarId);
    // No push from the sandbox: the polling reads the calendars.
    return { resourceId: `sandbox-resource-${calendarId}`, expiresAt: channel.expiresAt };
  }

  async stopChannel() {}
}

export class SandboxGoogleProvider implements GoogleCalendarProvider {
  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string; loginHint?: string }) {
    const url = new URL(SANDBOX_CONSENT_PATH, input.redirectUri);
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("redirect_uri", input.redirectUri);
    url.searchParams.set("scope", LINK_SCOPES.join(" "));
    if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
    return url.toString();
  }

  async exchangeCode(input: { code: string }) {
    if (!input.code.startsWith("sandbox:")) throw new GoogleError("rejected", "Not a sandbox code");
    const email = input.code.slice("sandbox:".length);
    const { subject } = await ensureSandboxAccount(email);
    return {
      subject,
      email,
      refreshToken: sandboxRefreshToken(subject),
      accessToken: `${ACCESS_PREFIX}${subject}`,
      expiresAt: new Date(Date.now() + HOUR_MS),
      scopes: ["openid", "email", ...CALENDAR_SCOPES],
    };
  }

  async refreshAccessToken(refreshToken: string) {
    if (!refreshToken.startsWith(REFRESH_PREFIX)) throw new GoogleError("auth", "invalid_grant");
    return { accessToken: `${ACCESS_PREFIX}${refreshToken.slice(REFRESH_PREFIX.length)}`, expiresAt: new Date(Date.now() + HOUR_MS) };
  }

  async revoke(token: string) {
    // Nothing to revoke in the sandbox; the token is plain text naming the account.
    void token;
  }

  calendar(accessToken: string): GoogleCalendarApi {
    if (!accessToken.startsWith(ACCESS_PREFIX)) throw new GoogleError("auth", "Invalid sandbox access token");
    return new SandboxCalendarApi(accessToken.slice(ACCESS_PREFIX.length));
  }
}
