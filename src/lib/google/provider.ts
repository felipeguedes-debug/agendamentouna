/**
 * Google Calendar behind one interface (PRD 12: googleapis with watch and polling),
 * as the WhatsApp cadence has MessagingProvider: the sync never talks to Google
 * directly, so tests and development run against the sandbox (D-58).
 * Implementations: ./client.ts (googleapis) and ./sandbox.ts (tables).
 * ./index.ts picks one.
 */

/**
 * The calendar grant of the link (D-01, D-59), the narrowest that does the job:
 * create the secondary calendar and write its events, list the calendars for the
 * busy choice, and read the events of the others. Identity comes with openid email.
 */
export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const;

export const LINK_SCOPES = ["openid", "email", ...CALENDAR_SCOPES] as const;

export type GoogleTokens = { refreshToken: string; accessToken: string; expiresAt: Date; scopes: string[] };

export type GoogleIdentity = { subject: string; email: string };

export type CalendarEntry = { id: string; summary: string; accessRole: string; primary: boolean };

/** A timed event has instants; an all-day one has dates ("YYYY-MM-DD", the end exclusive). */
export type EventTime = { dateTime: Date } | { date: string };

export type GoogleEvent = {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  /** Google's last modification time of the event. */
  updated: Date;
  /** Missing on some cancelled events. */
  start: EventTime | null;
  end: EventTime | null;
  /** "transparent" is "Livre" in Google, "opaque" is "Ocupado". */
  transparency: "opaque" | "transparent";
  /** default, outOfOffice, focusTime, workingLocation, birthday, fromGmail. */
  eventType: string;
  /** The calendar owner declined the invitation. */
  declinedBySelf: boolean;
  /** Set on the events the system writes (extendedProperties.private). */
  appointmentId: string | null;
};

/** What the system writes in the secondary calendar for an appointment (D-62). */
export type EventInput = {
  summary: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  timeZone: string;
  /** Null on a manual block's event (D-85). */
  appointmentId: string | null;
};

export type WatchChannel = { id: string; token: string; address: string; expiresAt: Date };

export interface GoogleCalendarApi {
  listCalendars(): Promise<CalendarEntry[]>;
  createCalendar(input: { summary: string; timeZone: string }): Promise<{ id: string }>;
  deleteCalendar(calendarId: string): Promise<void>;
  /** The events in the window (recurring ones expanded), without the cancelled ones. */
  listEvents(calendarId: string, window: { timeMin: Date; timeMax: Date }): Promise<GoogleEvent[]>;
  /** A deleted event comes back with status "cancelled" while Google keeps it; null once gone. */
  getEvent(calendarId: string, eventId: string): Promise<GoogleEvent | null>;
  /** Fails with "conflict" when the id exists, deleted events included. */
  insertEvent(calendarId: string, eventId: string, input: EventInput): Promise<GoogleEvent>;
  /** Also brings a deleted event back (status "confirmed"). */
  patchEvent(calendarId: string, eventId: string, input: EventInput): Promise<GoogleEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  watchEvents(calendarId: string, channel: WatchChannel): Promise<{ resourceId: string; expiresAt: Date }>;
  stopChannel(channel: { id: string; resourceId: string }): Promise<void>;
}

export interface GoogleCalendarProvider {
  /** The consent screen URL, with PKCE (S256) and the state of the link (D-59). */
  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string; loginHint?: string }): string;
  exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<GoogleIdentity & GoogleTokens>;
  /** Fails with "auth" when Google no longer accepts the refresh token (revoked, expired). */
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: Date }>;
  revoke(token: string): Promise<void>;
  calendar(accessToken: string): GoogleCalendarApi;
}

/**
 * - auth: the grant is gone (revoked, expired, wrong token): the link needs the
 *   professional again (PRD 5, rule 6);
 * - not_found: the event or calendar does not exist (404, 410);
 * - conflict: the event id is taken (409);
 * - transient: worth retrying (429, 5xx, rate limits, network);
 * - rejected: this request will not work (other 4xx, a scope missing).
 */
export type GoogleErrorKind = "auth" | "not_found" | "conflict" | "transient" | "rejected";

export class GoogleError extends Error {
  override name = "GoogleError";
  constructor(
    readonly kind: GoogleErrorKind,
    message: string,
  ) {
    super(message);
  }
}

export function isGoogleError(error: unknown, kind?: GoogleErrorKind): error is GoogleError {
  return error instanceof GoogleError && (!kind || error.kind === kind);
}
