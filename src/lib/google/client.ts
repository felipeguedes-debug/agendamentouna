// Only the Calendar module: the whole googleapis package takes seconds to load.
import { auth, calendar, type calendar_v3 } from "googleapis/build/src/apis/calendar/index.js";
import type { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import {
  GoogleError,
  LINK_SCOPES,
  type CalendarEntry,
  type EventInput,
  type EventTime,
  type GoogleCalendarApi,
  type GoogleCalendarProvider,
  type GoogleEvent,
  type WatchChannel,
} from "./provider";

/**
 * The real Google Calendar, through googleapis (PRD 12; D-58, D-59). The OAuth
 * client is the project's (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, the same as
 * the identity-only sign-in), with its own redirect: /api/google/oauth/callback.
 * Errors come out as GoogleError so the sync never looks at HTTP details.
 */

const PAGE_SIZE = 2500;
/** The id the system writes in its events (extendedProperties.private). */
const APPOINTMENT_PROPERTY = "agendaAppointmentId";
const REQUEST_TIMEOUT_MS = 20_000;

type ErrorShape = { status?: number; code?: number | string; message?: string; response?: { status?: number; data?: unknown } };

/** Maps a googleapis/gaxios error to the kinds the sync handles (./provider.ts). */
export function toGoogleError(error: unknown): GoogleError {
  if (error instanceof GoogleError) return error;
  const shape = (error ?? {}) as ErrorShape;
  const status = shape.response?.status ?? (typeof shape.status === "number" ? shape.status : typeof shape.code === "number" ? shape.code : undefined);
  const data = shape.response?.data as { error?: unknown } | undefined;
  const oauthError = typeof data?.error === "string" ? data.error : undefined;
  const reasons = JSON.stringify(data?.error ?? "");
  const message = shape.message ?? String(error);
  if (oauthError === "invalid_grant" || oauthError === "unauthorized_client" || status === 401) return new GoogleError("auth", oauthError ?? message);
  if (status === 404 || status === 410) return new GoogleError("not_found", message);
  if (status === 409) return new GoogleError("conflict", message);
  if (status === 429 || (status !== undefined && status >= 500)) return new GoogleError("transient", message);
  if (status === 403 && /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/.test(reasons)) return new GoogleError("transient", message);
  if (status === undefined) return new GoogleError("transient", message);
  return new GoogleError("rejected", message);
}

async function call<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw toGoogleError(error);
  }
}

function toTime(value: calendar_v3.Schema$EventDateTime | undefined): EventTime | null {
  if (value?.dateTime) return { dateTime: new Date(value.dateTime) };
  if (value?.date) return { date: value.date };
  return null;
}

/** Google's event as the sync reads it (./provider.ts). */
export function fromGoogleEvent(event: calendar_v3.Schema$Event): GoogleEvent {
  const status = event.status === "cancelled" || event.status === "tentative" ? event.status : "confirmed";
  return {
    id: event.id ?? "",
    status,
    updated: new Date(event.updated ?? 0),
    start: toTime(event.start),
    end: toTime(event.end),
    transparency: event.transparency === "transparent" ? "transparent" : "opaque",
    eventType: event.eventType ?? "default",
    declinedBySelf: Boolean(event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined")),
    appointmentId: event.extendedProperties?.private?.[APPOINTMENT_PROPERTY] ?? null,
  };
}

/** What the system writes: no attendees, no reminders of its own, always busy (D-62). */
export function toGoogleEventBody(input: EventInput): calendar_v3.Schema$Event {
  return {
    summary: input.summary,
    description: input.description,
    location: input.location,
    start: { dateTime: input.start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: input.end.toISOString(), timeZone: input.timeZone },
    status: "confirmed",
    transparency: "opaque",
    ...(input.appointmentId ? { extendedProperties: { private: { [APPOINTMENT_PROPERTY]: input.appointmentId } } } : {}),
  };
}

class GoogleCalendarClient implements GoogleCalendarApi {
  private readonly api: calendar_v3.Calendar;

  constructor(client: OAuth2Client) {
    this.api = calendar({ version: "v3", auth: client, timeout: REQUEST_TIMEOUT_MS });
  }

  async listCalendars(): Promise<CalendarEntry[]> {
    const entries: CalendarEntry[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await call(() => this.api.calendarList.list({ maxResults: 250, pageToken, showHidden: true }));
      for (const item of data.items ?? []) {
        if (item.id) entries.push({ id: item.id, summary: item.summaryOverride ?? item.summary ?? item.id, accessRole: item.accessRole ?? "reader", primary: Boolean(item.primary) });
      }
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
    return entries;
  }

  async createCalendar(input: { summary: string; timeZone: string }) {
    const { data } = await call(() => this.api.calendars.insert({ requestBody: { summary: input.summary, timeZone: input.timeZone } }));
    if (!data.id) throw new GoogleError("rejected", "Google created a calendar without id");
    return { id: data.id };
  }

  async deleteCalendar(calendarId: string) {
    await call(() => this.api.calendars.delete({ calendarId }));
  }

  async listEvents(calendarId: string, window: { timeMin: Date; timeMax: Date }) {
    const events: GoogleEvent[] = [];
    let pageToken: string | undefined;
    do {
      const { data } = await call(() =>
        this.api.events.list({
          calendarId,
          timeMin: window.timeMin.toISOString(),
          timeMax: window.timeMax.toISOString(),
          singleEvents: true,
          showDeleted: false,
          maxResults: PAGE_SIZE,
          pageToken,
        }),
      );
      for (const item of data.items ?? []) if (item.id && item.status !== "cancelled") events.push(fromGoogleEvent(item));
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
    return events;
  }

  async getEvent(calendarId: string, eventId: string) {
    try {
      const { data } = await call(() => this.api.events.get({ calendarId, eventId }));
      return fromGoogleEvent(data);
    } catch (error) {
      if (error instanceof GoogleError && error.kind === "not_found") return null;
      throw error;
    }
  }

  async insertEvent(calendarId: string, eventId: string, input: EventInput) {
    const { data } = await call(() => this.api.events.insert({ calendarId, requestBody: { id: eventId, ...toGoogleEventBody(input) } }));
    return fromGoogleEvent(data);
  }

  async patchEvent(calendarId: string, eventId: string, input: EventInput) {
    const { data } = await call(() => this.api.events.patch({ calendarId, eventId, requestBody: toGoogleEventBody(input) }));
    return fromGoogleEvent(data);
  }

  async deleteEvent(calendarId: string, eventId: string) {
    await call(() => this.api.events.delete({ calendarId, eventId }));
  }

  async watchEvents(calendarId: string, channel: WatchChannel) {
    const { data } = await call(() =>
      this.api.events.watch({
        calendarId,
        requestBody: { id: channel.id, type: "web_hook", address: channel.address, token: channel.token, expiration: String(channel.expiresAt.getTime()) },
      }),
    );
    if (!data.resourceId) throw new GoogleError("rejected", "Google opened a channel without resource id");
    return { resourceId: data.resourceId, expiresAt: data.expiration ? new Date(Number(data.expiration)) : channel.expiresAt };
  }

  async stopChannel(channel: { id: string; resourceId: string }) {
    await call(() => this.api.channels.stop({ requestBody: { id: channel.id, resourceId: channel.resourceId } }));
  }
}

export class GoogleApiProvider implements GoogleCalendarProvider {
  constructor(private readonly credentials: { clientId: string; clientSecret: string }) {}

  private client(redirectUri?: string) {
    return new auth.OAuth2({ clientId: this.credentials.clientId, clientSecret: this.credentials.clientSecret, redirectUri });
  }

  authorizationUrl(input: { state: string; codeChallenge: string; redirectUri: string; loginHint?: string }) {
    return this.client(input.redirectUri).generateAuthUrl({
      access_type: "offline",
      // A new refresh token at every link, even for an account linked before.
      prompt: "consent",
      scope: [...LINK_SCOPES],
      include_granted_scopes: false,
      state: input.state,
      code_challenge: input.codeChallenge,
      code_challenge_method: "S256" as CodeChallengeMethod,
      login_hint: input.loginHint,
    });
  }

  async exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }) {
    const client = this.client(input.redirectUri);
    const { tokens } = await call(() => client.getToken({ code: input.code, codeVerifier: input.codeVerifier, redirect_uri: input.redirectUri }));
    if (!tokens.refresh_token || !tokens.access_token || !tokens.id_token) throw new GoogleError("rejected", "Google did not return the offline grant");
    const ticket = await call(() => client.verifyIdToken({ idToken: tokens.id_token!, audience: this.credentials.clientId }));
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) throw new GoogleError("rejected", "Google did not return the account");
    return {
      subject: payload.sub,
      email: payload.email.toLowerCase(),
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3_000_000),
      scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
    };
  }

  async refreshAccessToken(refreshToken: string) {
    const client = this.client();
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await call(() => client.refreshAccessToken());
    if (!credentials.access_token) throw new GoogleError("auth", "Google did not renew the access token");
    return { accessToken: credentials.access_token, expiresAt: new Date(credentials.expiry_date ?? Date.now() + 3_000_000) };
  }

  async revoke(token: string) {
    await call(() => this.client().revokeToken(token));
  }

  calendar(accessToken: string): GoogleCalendarApi {
    const client = this.client();
    client.setCredentials({ access_token: accessToken });
    return new GoogleCalendarClient(client);
  }
}
