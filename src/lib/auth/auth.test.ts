import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  addMember,
  applySetCookies,
  createPractice,
  createUser,
  enableTwoFactor,
  signIn,
  TEST_PASSWORD,
  totpCode,
  uniqueEmail,
} from "../../../tests/helpers/auth";
import { auth } from "./auth";

// Better Auth against the test database (D-35 to D-37). Google is simulated by
// stubbing its token endpoint; everything else is the real library.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3_600_000;

type GoogleProfile = { sub: string; email: string; name: string };
let googleProfile: GoogleProfile | undefined;

beforeAll(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token") && googleProfile) {
      return Response.json({
        access_token: "fake-google-access-token",
        expires_in: 3599,
        scope: "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        token_type: "Bearer",
        id_token: unsignedIdToken(googleProfile),
      });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
  googleProfile = undefined;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

function headersWith(cookie: string) {
  return new Headers({ cookie });
}

describe("email and password", () => {
  it("signs in and creates a session whose id comes from the database (D-34)", async () => {
    const user = await createUser("password");
    const session = await auth.api.getSession({ headers: headersWith(await signIn(user.email)) });

    expect(session?.user.id).toBe(user.id);
    expect(session?.session.id).toMatch(UUID);
  });

  it("rejects a wrong password", async () => {
    const user = await createUser("wrong-password");
    await expect(signIn(user.email, "senha-errada-000")).rejects.toThrow();
  });

  it("does not allow public sign-up: only invitations create users", async () => {
    const email = uniqueEmail("signup");
    await expect(
      auth.api.signUpEmail({ body: { name: "Intrusa", email, password: TEST_PASSWORD } }),
    ).rejects.toThrow();
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });
});

describe("web session (D-17)", () => {
  it("expires after 12 h without activity", async () => {
    const user = await createUser("idle");
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = new Date("2026-11-02T11:00:00Z").getTime();
    vi.setSystemTime(start);
    const cookie = await signIn(user.email);

    vi.setSystemTime(start + 11.9 * HOUR);
    expect(await auth.api.getSession({ headers: headersWith(cookie), query: { disableRefresh: true } })).not.toBeNull();

    vi.setSystemTime(start + 12.1 * HOUR);
    expect(await auth.api.getSession({ headers: headersWith(cookie), query: { disableRefresh: true } })).toBeNull();
  });

  it("renews the session and its cookie with activity", async () => {
    const user = await createUser("active");
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = new Date("2026-11-02T11:00:00Z").getTime();
    vi.setSystemTime(start);
    let cookie = await signIn(user.email);

    vi.setSystemTime(start + 11 * HOUR);
    const { headers } = await auth.api.getSession({ headers: headersWith(cookie), returnHeaders: true });
    const renewed = headers.getSetCookie().find((value) => value.includes("session_token"));
    expect(renewed).toMatch(/Max-Age=43200/i);
    cookie = applySetCookies(cookie, headers);

    vi.setSystemTime(start + 22 * HOUR);
    expect(await auth.api.getSession({ headers: headersWith(cookie), query: { disableRefresh: true } })).not.toBeNull();
  });
});

describe("Google sign-in (D-01, D-35)", () => {
  async function signInWithGoogle(profile: GoogleProfile) {
    const { headers, response } = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: "/", errorCallbackURL: "/login" },
      returnHeaders: true,
    });
    const authorizationUrl = new URL(response.url!);
    let cookie = applySetCookies("", headers);
    googleProfile = profile;
    const callback = await auth.handler(
      new Request(
        `http://localhost:3000/api/auth/callback/google?code=fake-code&state=${authorizationUrl.searchParams.get("state")}`,
        { headers: { cookie } },
      ),
    );
    cookie = applySetCookies(cookie, callback.headers);
    return { authorizationUrl, location: callback.headers.get("location") ?? "", cookie };
  }

  it("asks Google for identity only, with no calendar scope and no offline access", async () => {
    const { response } = await auth.api.signInSocial({ body: { provider: "google", callbackURL: "/" }, returnHeaders: true });
    const url = new URL(response.url!);

    expect(url.searchParams.get("scope")!.split(" ").sort()).toEqual(["email", "openid", "profile"]);
    expect(url.searchParams.has("include_granted_scopes")).toBe(false);
    expect(url.searchParams.get("access_type")).not.toBe("offline");
  });

  it("refuses an email without an invitation and creates no user", async () => {
    const email = uniqueEmail("google-stranger");
    const { location } = await signInWithGoogle({ sub: "google-stranger", email, name: "Estranha" });

    expect(location).toContain("/login");
    expect(location).toContain("error=signup_disabled");
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("signs in an invited user and keeps no Google token", async () => {
    const user = await createUser("google-invited");
    const { location, cookie } = await signInWithGoogle({ sub: `sub-${user.id}`, email: user.email, name: user.name });

    expect(location).not.toContain("error");
    expect((await auth.api.getSession({ headers: headersWith(cookie) }))?.user.id).toBe(user.id);
    const google = await prisma.account.findFirstOrThrow({ where: { userId: user.id, providerId: "google" } });
    expect(google.accountId).toBe(`sub-${user.id}`);
    expect([google.accessToken, google.refreshToken, google.idToken]).toEqual([null, null, null]);
  });

  it("asks for the second factor when the user has two-factor authentication (D-36)", async () => {
    const user = await createUser("google-2fa");
    const { secret } = await enableTwoFactor(await signIn(user.email));

    const { location, cookie } = await signInWithGoogle({ sub: `sub-${user.id}`, email: user.email, name: user.name });
    expect(location).toBe("/login/segundo-fator");
    expect(await auth.api.getSession({ headers: headersWith(cookie) })).toBeNull();

    await expect(
      auth.api.verifyTOTP({ body: { code: "000000" }, headers: headersWith(cookie) }),
    ).rejects.toThrow();
    const verified = await auth.api.verifyTOTP({
      body: { code: await totpCode(secret) },
      headers: headersWith(cookie),
      returnHeaders: true,
    });
    const session = await auth.api.getSession({ headers: headersWith(applySetCookies(cookie, verified.headers)) });
    expect(session?.user.id).toBe(user.id);
  });
});

describe("two-factor authentication (D-16, D-36)", () => {
  it("asks for the code after the password and creates the session only with the right code", async () => {
    const user = await createUser("password-2fa");
    const { secret } = await enableTwoFactor(await signIn(user.email));

    const { headers, response } = await auth.api.signInEmail({
      body: { email: user.email, password: TEST_PASSWORD },
      returnHeaders: true,
    });
    expect(response).toMatchObject({ twoFactorRedirect: true });
    const challenge = applySetCookies("", headers);
    expect(await auth.api.getSession({ headers: headersWith(challenge) })).toBeNull();

    const verified = await auth.api.verifyTOTP({
      body: { code: await totpCode(secret) },
      headers: headersWith(challenge),
      returnHeaders: true,
    });
    const session = await auth.api.getSession({ headers: headersWith(applySetCookies(challenge, verified.headers)) });
    expect(session?.user.id).toBe(user.id);
  });

  it("cannot be turned off while a practice of the user requires it", async () => {
    const { practiceId } = await createPractice("Exige 2FA", { requireTwoFactor: true });
    const user = await createUser("required-2fa");
    await addMember(user.id, practiceId, "SECRETARY");
    const { cookie } = await enableTwoFactor(await signIn(user.email));

    await expect(
      auth.api.disableTwoFactor({ body: { password: TEST_PASSWORD }, headers: headersWith(cookie) }),
    ).rejects.toMatchObject({ body: { code: "TWO_FACTOR_REQUIRED_BY_PRACTICE" } });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).twoFactorEnabled).toBe(true);
  });

  it("can be turned off when no practice requires it", async () => {
    const user = await createUser("optional-2fa");
    const { cookie } = await enableTwoFactor(await signIn(user.email));

    await auth.api.disableTwoFactor({ body: { password: TEST_PASSWORD }, headers: headersWith(cookie) });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).twoFactorEnabled).toBe(false);
  });
});

/** Google's id_token as the code exchange returns it; Better Auth only decodes it there. */
function unsignedIdToken(profile: GoogleProfile) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return [
    encode({ alg: "RS256", typ: "JWT" }),
    encode({
      iss: "https://accounts.google.com",
      aud: "test-google-client-id",
      sub: profile.sub,
      email: profile.email,
      email_verified: true,
      name: profile.name,
      iat: now,
      exp: now + 3600,
    }),
    "signature",
  ].join(".");
}
