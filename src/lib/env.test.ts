import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedCrmContacts, crmMode, crmProviderForToken } from "@/lib/crm";
import { SandboxCrmProvider } from "@/lib/crm/sandbox";
import { ConsoleEmailSender, getEmailSender } from "@/lib/email/sender";
import { gmailSettings } from "@/lib/email/gmail";
import { allowedGoogleAccounts, googleMode, googleProviderFor } from "@/lib/google";
import { SandboxGoogleProvider } from "@/lib/google/sandbox";
import { allowedNumbers, messagingMode } from "@/lib/messaging";
import { allowedPushUsers, pushMode } from "@/lib/push";
import { appBaseUrl, appOrigins, isProduction, usesTestDatabase } from "./env";

// Vercel sets NODE_ENV=production on previews too (D-95). A preview must behave as a test
// environment: the sandbox by default, and the allow lists when a real provider is on.

const REAL_DATABASE = "postgresql://agenda:segredo@banco.example/agenda?schema=public";

function asEnv(values: Record<string, string>) {
  return values as unknown as NodeJS.ProcessEnv;
}

function stubEnvironment(values: Record<string, string>) {
  vi.stubEnv("DATABASE_URL", REAL_DATABASE);
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

const PREVIEW = { NODE_ENV: "production", VERCEL_ENV: "preview" };
const VERCEL_PRODUCTION = { NODE_ENV: "production", VERCEL_ENV: "production" };

afterEach(() => vi.unstubAllEnvs());

describe("isProduction", () => {
  it("follows VERCEL_ENV on Vercel, whatever NODE_ENV says", () => {
    expect(isProduction(asEnv(PREVIEW))).toBe(false);
    expect(isProduction(asEnv({ NODE_ENV: "production", VERCEL_ENV: "development" }))).toBe(false);
    expect(isProduction(asEnv(VERCEL_PRODUCTION))).toBe(true);
  });

  it("follows NODE_ENV anywhere else", () => {
    expect(isProduction(asEnv({ NODE_ENV: "production" }))).toBe(true);
    expect(isProduction(asEnv({ NODE_ENV: "development" }))).toBe(false);
    expect(isProduction(asEnv({ NODE_ENV: "test" }))).toBe(false);
  });
});

describe("usesTestDatabase", () => {
  it("recognizes only a database whose name ends in _test (D-32)", () => {
    expect(usesTestDatabase(asEnv({ DATABASE_URL: "postgresql://a:b@127.0.0.1:5432/agenda_test?schema=public" }))).toBe(true);
    expect(usesTestDatabase(asEnv({ DATABASE_URL: REAL_DATABASE }))).toBe(false);
    expect(usesTestDatabase(asEnv({}))).toBe(false);
  });
});

describe("on a Vercel preview", () => {
  it("every provider is the sandbox, even with a real one asked by leftover settings it needs the list", () => {
    stubEnvironment(PREVIEW);
    vi.stubEnv("MESSAGING_PROVIDER", "");
    vi.stubEnv("GOOGLE_CALENDAR_PROVIDER", "");
    vi.stubEnv("CRM_PROVIDER", "");
    vi.stubEnv("PUSH_PROVIDER", "");
    expect(messagingMode()).toBe("sandbox");
    expect(googleMode()).toBe("sandbox");
    expect(crmMode()).toBe("sandbox");
    expect(pushMode()).toBe("sandbox");
  });

  it("a real provider reaches only its allow list", () => {
    stubEnvironment({ ...PREVIEW, MESSAGING_PROVIDER: "whatsapi", GOOGLE_CALENDAR_PROVIDER: "google", CRM_PROVIDER: "flwchat", PUSH_PROVIDER: "webpush" });
    vi.stubEnv("MESSAGING_ALLOWED_NUMBERS", "");
    vi.stubEnv("GOOGLE_ALLOWED_ACCOUNTS", "teste@exemplo.test");
    vi.stubEnv("CRM_ALLOWED_CONTACTS", "");
    vi.stubEnv("PUSH_ALLOWED_USERS", "");
    expect(messagingMode()).toBe("whatsapi");
    expect(allowedNumbers()).toEqual([]);
    expect(allowedGoogleAccounts()).toEqual(["teste@exemplo.test"]);
    expect(allowedCrmContacts()).toEqual([]);
    expect(allowedPushUsers()).toEqual([]);
  });

  it("a fake link and a fake token stay in the sandbox with the real provider on", () => {
    stubEnvironment({ ...PREVIEW, GOOGLE_CALENDAR_PROVIDER: "google", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "segredo", CRM_PROVIDER: "flwchat" });
    expect(googleProviderFor("sandbox-conta")).toBeInstanceOf(SandboxGoogleProvider);
    expect(crmProviderForToken("sandbox-conta")).toBeInstanceOf(SandboxCrmProvider);
  });

  it("e-mail prints on the terminal without a provider, and Gmail reaches only its list", () => {
    expect(getEmailSender(asEnv(PREVIEW))).toBeInstanceOf(ConsoleEmailSender);
    expect(gmailSettings(asEnv({ ...PREVIEW, GMAIL_USER: "agenda@exemplo.test", GMAIL_APP_PASSWORD: "senha" })).allowedRecipients).toEqual([]);
  });
});

describe("in Vercel's production", () => {
  it("every provider is real, with no list", () => {
    stubEnvironment({ ...VERCEL_PRODUCTION, MESSAGING_PROVIDER: "sandbox", GOOGLE_CALENDAR_PROVIDER: "sandbox", CRM_PROVIDER: "sandbox", PUSH_PROVIDER: "sandbox" });
    expect(messagingMode()).toBe("whatsapi");
    expect(googleMode()).toBe("google");
    expect(crmMode()).toBe("flwchat");
    expect(pushMode()).toBe("webpush");
    expect(allowedNumbers()).toBeUndefined();
    expect(allowedGoogleAccounts()).toBeUndefined();
    expect(allowedCrmContacts()).toBeUndefined();
    expect(allowedPushUsers()).toBeUndefined();
  });

  it("a token or a link that looks fake is not given the sandbox", () => {
    stubEnvironment({ ...VERCEL_PRODUCTION, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "segredo" });
    expect(googleProviderFor("sandbox-conta")).not.toBeInstanceOf(SandboxGoogleProvider);
    expect(crmProviderForToken("sandbox-conta")).not.toBeInstanceOf(SandboxCrmProvider);
  });

  it("e-mail refuses to run without a provider", () => {
    expect(() => getEmailSender(asEnv(VERCEL_PRODUCTION))).toThrow(/provider/);
  });
});

describe("the production build of the end-to-end flows, on the test database (D-46)", () => {
  it("stays in the sandbox for every provider", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://agenda:agenda@127.0.0.1:5432/agenda_test?schema=public");
    vi.stubEnv("MESSAGING_PROVIDER", "sandbox");
    vi.stubEnv("GOOGLE_CALENDAR_PROVIDER", "sandbox");
    vi.stubEnv("CRM_PROVIDER", "sandbox");
    vi.stubEnv("PUSH_PROVIDER", "sandbox");
    expect(messagingMode()).toBe("sandbox");
    expect(googleMode()).toBe("sandbox");
    expect(crmMode()).toBe("sandbox");
    expect(pushMode()).toBe("sandbox");
  });
});

describe("appBaseUrl", () => {
  it("is BETTER_AUTH_URL when set", () => {
    expect(appBaseUrl(asEnv({ BETTER_AUTH_URL: "https://agenda.exemplo.test", VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "ramo.vercel.app" }))).toBe("https://agenda.exemplo.test");
  });

  it("on a preview without it, is the branch's address, which stays the same between pushes", () => {
    expect(appBaseUrl(asEnv({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "ramo.vercel.app", VERCEL_URL: "unica.vercel.app" }))).toBe("https://ramo.vercel.app");
    expect(appBaseUrl(asEnv({ VERCEL_ENV: "preview", VERCEL_URL: "unica.vercel.app" }))).toBe("https://unica.vercel.app");
  });

  it("in production without it, is the project's production address", () => {
    expect(appBaseUrl(asEnv({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "agenda.vercel.app", VERCEL_URL: "unica.vercel.app" }))).toBe("https://agenda.vercel.app");
  });

  it("falls back to the local server in development", () => {
    expect(appBaseUrl(asEnv({ NODE_ENV: "development" }))).toBe("http://localhost:3000");
  });
});

describe("appOrigins", () => {
  it("accepts both addresses of a preview, the branch's and the deployment's", () => {
    expect(appOrigins(asEnv({ VERCEL_ENV: "preview", VERCEL_BRANCH_URL: "ramo.vercel.app", VERCEL_URL: "unica.vercel.app" })).sort()).toEqual(["https://ramo.vercel.app", "https://unica.vercel.app"]);
  });

  it("in production accepts only the app's address", () => {
    expect(appOrigins(asEnv({ VERCEL_ENV: "production", BETTER_AUTH_URL: "https://agenda.exemplo.test", VERCEL_URL: "unica.vercel.app" }))).toEqual(["https://agenda.exemplo.test"]);
  });
});
