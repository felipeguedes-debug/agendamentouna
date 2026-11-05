import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { auth } from "@/lib/auth/auth";
import { prisma } from "@/lib/db";

// Test data for the auth tests. Every helper creates its own rows with unique
// emails, so test files never depend on each other or on the seed.

export const TEST_PASSWORD = "senha-de-teste-123";

export function uniqueEmail(label: string) {
  return `${label}-${randomUUID().slice(0, 8)}@example.com`;
}

export async function createPractice(
  name: string,
  options: { organizationId?: string; requireTwoFactor?: boolean } = {},
) {
  const organizationId =
    options.organizationId ?? (await prisma.organization.create({ data: { name: `Org ${name}` } })).id;
  const practice = await prisma.practice.create({
    data: { organizationId, name, requireTwoFactor: options.requireTwoFactor ?? false },
  });
  return { organizationId, practiceId: practice.id };
}

/** A user who signs in with TEST_PASSWORD, as if created by an accepted invitation. */
export async function createUser(label: string, options: { password?: string | null } = {}) {
  const user = await prisma.user.create({
    data: {
      name: `User ${label}`,
      email: uniqueEmail(label),
      emailVerified: true,
      termsAcceptedAt: new Date(),
      termsVersion: "test",
    },
  });
  const password = options.password === undefined ? TEST_PASSWORD : options.password;
  if (password !== null) {
    await prisma.account.create({
      data: { userId: user.id, providerId: "credential", accountId: user.id, password: await hashPassword(password) },
    });
  }
  return user;
}

export async function addMember(userId: string, practiceId: string, role: Role, options: { revoked?: boolean } = {}) {
  return prisma.membership.create({
    data: { userId, practiceId, role, revokedAt: options.revoked ? new Date() : null },
  });
}

export async function addOrganizationAdmin(userId: string, organizationId: string, options: { revoked?: boolean } = {}) {
  return prisma.organizationMember.create({
    data: { userId, organizationId, role: "ADMIN", revokedAt: options.revoked ? new Date() : null },
  });
}

/** Signs in with email and password and returns the browser's Cookie header. */
export async function signIn(email: string, password = TEST_PASSWORD) {
  const { headers, response } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  if ("twoFactorRedirect" in response) {
    throw new Error(`${email} has two-factor authentication; use the challenge flow`);
  }
  return applySetCookies("", headers);
}

/** What a browser sends after receiving `headers`: Set-Cookie applied on top of `cookie`. */
export function applySetCookies(cookie: string, headers: Headers) {
  const jar = new Map(
    cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), part.slice(index + 1)] as const;
      }),
  );
  for (const setCookie of headers.getSetCookie()) {
    const [pair, ...attributes] = setCookie.split(";").map((part) => part.trim());
    const index = pair.indexOf("=");
    const name = pair.slice(0, index);
    const value = pair.slice(index + 1);
    const expired = attributes.some((attribute) => /^max-age=0$/i.test(attribute)) || value === "";
    if (expired) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

/**
 * Turns on TOTP for a signed-in user the way the security page does (enable, then
 * confirm with a code). Confirming replaces the session, so it returns the new
 * Cookie header along with the authenticator secret.
 */
export async function enableTwoFactor(cookie: string, password = TEST_PASSWORD) {
  const enabled = await auth.api.enableTwoFactor({
    body: { password },
    headers: new Headers({ cookie }),
  });
  if (enabled.method !== "totp") throw new Error("Expected a TOTP setup");
  const secret = decodeBase32(new URL(enabled.totpURI).searchParams.get("secret")!);
  const { headers } = await auth.api.verifyTOTP({
    body: { code: await totpCode(secret) },
    headers: new Headers({ cookie }),
    returnHeaders: true,
  });
  return { secret, cookie: applySetCookies(cookie, headers) };
}

/** The otpauth URI carries the secret in base32 (RFC 4648); generateTOTP takes it raw. */
function decodeBase32(encoded: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of encoded.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const bytes = bits.match(/.{8}/g)?.map((byte) => parseInt(byte, 2)) ?? [];
  return Buffer.from(bytes).toString("utf8");
}

export async function totpCode(secret: string) {
  const { code } = await auth.api.generateTOTP({ body: { secret } });
  return code;
}

/**
 * Makes `next/headers` answer as if the request carried `cookie`. Test files that
 * use it must call `vi.mock("next/headers")` at the top.
 */
export async function setRequestCookie(cookie: string) {
  const nextHeaders = await import("next/headers");
  vi.mocked(nextHeaders.headers).mockResolvedValue(new Headers(cookie ? { cookie } : {}) as never);
  vi.mocked(nextHeaders.cookies).mockResolvedValue(fakeCookieStore(cookie) as never);
}

function fakeCookieStore(cookie: string) {
  const values = new Map(
    cookie
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => [part.slice(0, part.indexOf("=")), part.slice(part.indexOf("=") + 1)] as const),
  );
  return {
    get: (name: string) => (values.has(name) ? { name, value: values.get(name)! } : undefined),
    has: (name: string) => values.has(name),
    getAll: () => [...values].map(([name, value]) => ({ name, value })),
    set: () => undefined,
    delete: () => undefined,
  };
}

/** The digest Next.js puts on the error thrown by redirect(), notFound() and forbidden(). */
export async function interruption(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const digest = (error as { digest?: unknown }).digest;
    if (typeof digest === "string") {
      if (digest.startsWith("NEXT_REDIRECT")) return `redirect:${digest.split(";")[2]}`;
      if (digest === "NEXT_HTTP_ERROR_FALLBACK;404") return "not-found";
      if (digest === "NEXT_HTTP_ERROR_FALLBACK;403") return "forbidden";
    }
    throw error;
  }
  return "rendered";
}
