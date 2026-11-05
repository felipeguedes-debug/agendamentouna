import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createUser, TEST_PASSWORD } from "../../../tests/helpers/auth";
import { auth, AUTH_RATE_LIMIT } from "./auth";

// The sign-in limit lives in the database (D-96): each serverless instance has its own
// memory, so a counter in memory would start over on every one of them. Better Auth only
// turns the limit on when NODE_ENV is production, so these tests turn it on themselves,
// with the app's settings, and use two clients to play two instances.

function instance() {
  return betterAuth({
    baseURL: "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    advanced: { database: { generateId: "uuid" } },
    telemetry: { enabled: false },
    emailAndPassword: { enabled: true, disableSignUp: true },
    rateLimit: { ...AUTH_RATE_LIMIT, enabled: true },
  });
}

const firstInstance = instance();
const secondInstance = instance();

let counter = 0;

/** A different address per test, so the buckets of two tests never mix. */
function uniqueAddress() {
  counter += 1;
  return `203.0.113.${counter}`;
}

function signIn(target: typeof firstInstance, address: string, email: string, password: string) {
  return target.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000", "x-forwarded-for": address },
      body: JSON.stringify({ email, password }),
    }),
  );
}

let email: string;

beforeAll(async () => {
  email = (await createUser("rate-limit")).email;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("the sign-in limit", () => {
  it("is set to the database in the app's configuration", () => {
    expect(auth.options.rateLimit?.storage).toBe("database");
  });

  it("stops the fourth attempt in 10 s, even on another instance", async () => {
    const address = uniqueAddress();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await signIn(firstInstance, address, email, "senha-errada-123");
      expect(response.status).toBe(401);
    }
    const blocked = await signIn(secondInstance, address, email, "senha-errada-123");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("x-retry-after"))).toBeGreaterThan(0);
  });

  it("blocks the right password too once the limit is reached", async () => {
    const address = uniqueAddress();
    for (let attempt = 0; attempt < 3; attempt += 1) await signIn(firstInstance, address, email, "senha-errada-123");
    expect((await signIn(firstInstance, address, email, TEST_PASSWORD)).status).toBe(429);
  });

  it("counts each address on its own", async () => {
    const address = uniqueAddress();
    for (let attempt = 0; attempt < 3; attempt += 1) await signIn(firstInstance, address, email, "senha-errada-123");
    expect((await signIn(secondInstance, uniqueAddress(), email, TEST_PASSWORD)).status).toBe(200);
  });

  it("keeps the counter in the RateLimit table, by address and path", async () => {
    const address = uniqueAddress();
    await signIn(firstInstance, address, email, "senha-errada-123");
    const row = await prisma.rateLimit.findUnique({ where: { key: `${address}|/sign-in/email` } });
    expect(row?.count).toBe(1);
    expect(Number(row?.lastRequest)).toBeGreaterThan(Date.now() - 60_000);
  });

  it("opens again when the window ends, and removes what is old", async () => {
    const address = uniqueAddress();
    const key = `${address}|/sign-in/email`;
    for (let attempt = 0; attempt < 3; attempt += 1) await signIn(firstInstance, address, email, "senha-errada-123");
    await prisma.rateLimit.update({ where: { key }, data: { lastRequest: Date.now() - 11_000 } });
    // Holds an address (D-96): a row of a window long gone must not stay.
    const stale = `198.51.100.${randomUUID().slice(0, 4)}|/sign-in/email`;
    await prisma.rateLimit.create({ data: { key: stale, count: 1, lastRequest: Date.now() - 3_600_000 } });

    expect((await signIn(firstInstance, address, email, "senha-errada-123")).status).toBe(401);
    await expect.poll(() => prisma.rateLimit.count({ where: { key: stale } })).toBe(0);
  });

  it("leaves reading the session out of it: the PWA asks every minute (D-76)", async () => {
    const address = uniqueAddress();
    const response = await firstInstance.handler(new Request("http://localhost:3000/api/auth/get-session", { headers: { "x-forwarded-for": address } }));
    expect(response.status).toBe(200);
    expect(await prisma.rateLimit.count({ where: { key: { startsWith: address } } })).toBe(0);
  });
});
