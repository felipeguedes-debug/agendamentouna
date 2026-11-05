import { appBaseUrl, isProduction, requiresRealProviders } from "@/lib/env";
import { GoogleApiProvider } from "./client";
import type { GoogleCalendarProvider } from "./provider";
import { SANDBOX_SUBJECT_PREFIX, SandboxGoogleProvider } from "./sandbox";

export { GoogleError, isGoogleError, type GoogleCalendarApi, type GoogleCalendarProvider } from "./provider";

/**
 * Picks the Google provider from GOOGLE_CALENDAR_PROVIDER (D-58): "google" talks
 * to Google, "sandbox" (the default outside production) to the SandboxGoogle
 * tables. Production always talks to Google, except the production build of the
 * end-to-end flows, on the test database (D-46). Outside production, a Vercel preview
 * included (D-95), the real provider links only the test accounts in GOOGLE_ALLOWED_ACCOUNTS, so a developer never
 * reaches a professional's real agenda.
 */

export type GoogleSyncOptions = { now?: Date; provider?: GoogleCalendarProvider };

export function googleMode(): "google" | "sandbox" {
  if (requiresRealProviders()) return "google";
  return process.env.GOOGLE_CALENDAR_PROVIDER === "google" ? "google" : "sandbox";
}

/** Google accounts the real provider may link outside production; undefined allows all (production). */
export function allowedGoogleAccounts() {
  if (isProduction()) return undefined;
  return (process.env.GOOGLE_ALLOWED_ACCOUNTS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function googleProvider(): GoogleCalendarProvider {
  if (googleMode() === "sandbox") return new SandboxGoogleProvider();
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set (see .env.example)");
  return new GoogleApiProvider({ clientId, clientSecret });
}

/**
 * The provider of one link. Outside production a sandbox link (its subject starts
 * with "sandbox-") stays in the sandbox even with the real provider on, so a test
 * with a real Google account does not revoke the demo's fake links.
 */
export function googleProviderFor(googleSubject: string): GoogleCalendarProvider {
  if (!isProduction() && googleSubject.startsWith(SANDBOX_SUBJECT_PREFIX)) return new SandboxGoogleProvider();
  return googleProvider();
}

/** The link's callback, registered as a redirect URI of the OAuth client. */
export function googleRedirectUri() {
  return new URL("/api/google/oauth/callback", appBaseUrl()).toString();
}

/** Where Google posts push notifications; push needs public HTTPS (D-24), else only the polling runs. */
export function googleWebhookAddress() {
  const base = process.env.PUBLIC_WEBHOOK_URL;
  if (!base || !base.startsWith("https://")) return null;
  return new URL("/api/webhooks/google", base).toString();
}

/** The appointment's page, linked from its Google event. */
export function appointmentUrl(practiceId: string, appointmentId: string) {
  return new URL(`/conta/${practiceId}/agendamentos/${appointmentId}`, appBaseUrl()).toString();
}
