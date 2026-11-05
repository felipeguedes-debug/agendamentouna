import { encryptSecret } from "@/lib/crypto/secrets";
import { forPractice, prisma } from "@/lib/db";
import { ensureSecondaryCalendars } from "@/lib/google/connection";
import type { GoogleCalendarApi, GoogleCalendarProvider, GoogleErrorKind } from "@/lib/google/provider";
import { GoogleError } from "@/lib/google/provider";
import { ensureSandboxAccount, SandboxGoogleProvider, sandboxRefreshToken } from "@/lib/google/sandbox";
import { uniqueEmail } from "./auth";

// Google test data (Block 6): a professional linked to a sandbox Google account,
// whose calendars and events live in the SandboxGoogle tables. Every call creates
// its own account, so tests never share a calendar.

export type LinkedGoogle = {
  connectionId: string;
  subject: string;
  email: string;
  primaryCalendarId: string;
  /** The secondary calendar of the professional in this practice, when created. */
  secondaryCalendarId: string | null;
};

/**
 * Links the professional to a sandbox Google account as a finished OAuth link
 * would, and by default lets the setup create the practice's secondary calendar.
 * Pass `email` of an existing link to share its connection (D-04).
 */
export async function linkGoogle(practiceId: string, professionalId: string, options: { email?: string; secondary?: boolean; now?: Date } = {}): Promise<LinkedGoogle> {
  const email = options.email ?? uniqueEmail("google");
  const { subject, primaryCalendarId } = await ensureSandboxAccount(email);
  const connection = await prisma.googleConnection.upsert({
    where: { googleSubject: subject },
    create: { googleSubject: subject, email, refreshTokenEncrypted: encryptSecret(sandboxRefreshToken(subject)), scopes: ["sandbox"] },
    update: {},
  });
  await forPractice(practiceId).professional.update({ where: { id: professionalId }, data: { googleConnectionId: connection.id } });
  let secondaryCalendarId: string | null = null;
  if (options.secondary !== false) {
    await ensureSecondaryCalendars(connection.id, { now: options.now });
    secondaryCalendarId =
      (await forPractice(practiceId).googleSecondaryCalendar.findFirst({ where: { professionalId }, select: { googleCalendarId: true } }))?.googleCalendarId ?? null;
  }
  return { connectionId: connection.id, subject, email, primaryCalendarId, secondaryCalendarId };
}

/** The sandbox, except for the calls listed, which fail with the given kind. */
export function failingProvider(kind: GoogleErrorKind, calls: readonly (keyof GoogleCalendarApi | "refreshAccessToken")[]): GoogleCalendarProvider & { attempts: number } {
  const sandbox = new SandboxGoogleProvider();
  const provider = {
    attempts: 0,
    authorizationUrl: sandbox.authorizationUrl.bind(sandbox),
    exchangeCode: sandbox.exchangeCode.bind(sandbox),
    revoke: sandbox.revoke.bind(sandbox),
    async refreshAccessToken(refreshToken: string) {
      if (calls.includes("refreshAccessToken")) {
        provider.attempts += 1;
        throw new GoogleError(kind, "refresh refused by the test");
      }
      return sandbox.refreshAccessToken(refreshToken);
    },
    calendar(accessToken: string) {
      const api = sandbox.calendar(accessToken);
      return new Proxy(api, {
        get(target, property, receiver) {
          const value = Reflect.get(target, property, receiver);
          if (typeof value !== "function") return value;
          if (!calls.includes(property as keyof GoogleCalendarApi)) return value.bind(target);
          return async () => {
            provider.attempts += 1;
            throw new GoogleError(kind, `${String(property)} refused by the test`);
          };
        },
      });
    },
  };
  return provider;
}

/** The appointment's Google sync columns. */
export async function googleStateOf(practiceId: string, appointmentId: string) {
  return forPractice(practiceId).appointment.findFirstOrThrow({
    where: { id: appointmentId },
    select: { googleEventId: true, googleSyncRequestedAt: true, googleSyncedAt: true, googleEventUpdatedAt: true, googleSyncError: true, googleSyncAttempts: true },
  });
}

/** Google blocks of the professional, earliest first. */
export async function googleBlocksOf(practiceId: string, professionalId: string) {
  return forPractice(practiceId).timeBlock.findMany({ where: { professionalId, source: "GOOGLE" }, orderBy: { startsAt: "asc" } });
}
