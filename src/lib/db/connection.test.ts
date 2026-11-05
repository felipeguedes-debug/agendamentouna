import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertLocalDatabase, assertMigratable, isLocalDatabase, migrationDatabaseUrl, poolConfig } from "./connection";

// The app reaches Supabase through the transaction pooler, and migrations through a
// connection that keeps a session (D-97). The demo seed and the commands that wipe a
// database only run on a database of this machine (D-98).

const TRANSACTION_POOLER = "postgresql://postgres.ref:segredo@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
const SESSION_POOLER = "postgresql://postgres.ref:segredo@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
const DIRECT = "postgresql://postgres:segredo@db.ref.supabase.co:5432/postgres";
const LOCAL = "postgresql://agenda:agenda@127.0.0.1:5432/agenda?schema=public";
const CA = "-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----\n";

function asEnv(values: Record<string, string>) {
  return values as unknown as NodeJS.ProcessEnv;
}

// pg's own merge of the options and the connection string, where a sslmode in the URL
// would replace the certificate given in the options.
const ConnectionParameters = createRequire(import.meta.url)("pg/lib/connection-parameters") as new (config: object) => { ssl: unknown };

describe("migrationDatabaseUrl", () => {
  it("prefers DIRECT_URL, since the app's URL goes through the transaction pooler", () => {
    expect(migrationDatabaseUrl(asEnv({ DATABASE_URL: TRANSACTION_POOLER, DIRECT_URL: SESSION_POOLER }))).toBe(SESSION_POOLER);
  });

  it("is DATABASE_URL when there is one database URL, as in development", () => {
    expect(migrationDatabaseUrl(asEnv({ DATABASE_URL: LOCAL }))).toBe(LOCAL);
    expect(migrationDatabaseUrl(asEnv({ DATABASE_URL: LOCAL, DIRECT_URL: "" }))).toBe(LOCAL);
  });

  it("is undefined without any, so `prisma generate` still runs on a fresh clone", () => {
    expect(migrationDatabaseUrl(asEnv({}))).toBeUndefined();
  });
});

describe("assertMigratable", () => {
  it("accepts the session pooler and the direct connection", () => {
    expect(() => assertMigratable(SESSION_POOLER)).not.toThrow();
    expect(() => assertMigratable(DIRECT)).not.toThrow();
    expect(() => assertMigratable(LOCAL)).not.toThrow();
  });

  it("refuses the transaction pooler, where the advisory lock of a migration does not hold", () => {
    expect(() => assertMigratable(TRANSACTION_POOLER)).toThrow(/DIRECT_URL/);
    expect(() => assertMigratable("postgresql://u:p@pooler.example:5432/postgres?pgbouncer=true")).toThrow(/DIRECT_URL/);
  });

  it("refuses to run with no URL at all", () => {
    expect(() => assertMigratable(undefined)).toThrow(/DIRECT_URL/);
  });
});

describe("poolConfig", () => {
  it("leaves a local database with the driver's defaults, in plain TCP", () => {
    expect(poolConfig(LOCAL, asEnv({}))).toEqual({ connectionString: LOCAL });
  });

  it("on a remote database keeps few connections, closes idle ones soon and does not wait forever", () => {
    const config = poolConfig(TRANSACTION_POOLER, asEnv({ DATABASE_CA_CERT: CA }));
    expect(config.max).toBe(5);
    expect(config.idleTimeoutMillis).toBe(5_000);
    expect(config.connectionTimeoutMillis).toBe(10_000);
  });

  it("takes the pool's size from DATABASE_POOL_MAX, but never less than 2", () => {
    expect(poolConfig(TRANSACTION_POOLER, asEnv({ DATABASE_CA_CERT: CA, DATABASE_POOL_MAX: "8" })).max).toBe(8);
    // With 1, a query made while a transaction holds the only connection would wait forever.
    expect(poolConfig(TRANSACTION_POOLER, asEnv({ DATABASE_CA_CERT: CA, DATABASE_POOL_MAX: "1" })).max).toBe(2);
    expect(poolConfig(TRANSACTION_POOLER, asEnv({ DATABASE_CA_CERT: CA, DATABASE_POOL_MAX: "muitos" })).max).toBe(5);
  });

  it("verifies the server with the certificate, even with a sslmode in the URL", () => {
    const config = poolConfig(`${TRANSACTION_POOLER}?sslmode=require`, asEnv({ DATABASE_CA_CERT: CA }));
    expect(config.connectionString).toBe(TRANSACTION_POOLER);
    expect(new ConnectionParameters(config).ssl).toEqual({ ca: CA, rejectUnauthorized: true });
  });

  it("reads a certificate saved with escaped line breaks", () => {
    const config = poolConfig(TRANSACTION_POOLER, asEnv({ DATABASE_CA_CERT: CA.replaceAll("\n", "\\n") }));
    expect(new ConnectionParameters(config).ssl).toEqual({ ca: CA, rejectUnauthorized: true });
  });

  it("refuses a remote database with neither a certificate nor a sslmode: it would go in the clear", () => {
    expect(() => poolConfig(TRANSACTION_POOLER, asEnv({}))).toThrow(/DATABASE_CA_CERT/);
  });

  it("refuses sslmode=disable on a remote database", () => {
    expect(() => poolConfig(`${TRANSACTION_POOLER}?sslmode=disable`, asEnv({}))).toThrow(/DATABASE_CA_CERT/);
  });

  it("keeps an explicit sslmode=no-verify as the operator's choice", () => {
    const url = `${TRANSACTION_POOLER}?sslmode=no-verify`;
    const config = poolConfig(url, asEnv({}));
    expect(config.connectionString).toBe(url);
    expect(new ConnectionParameters(config).ssl).toEqual({ rejectUnauthorized: false });
  });

  it("names no prepared statement, which the transaction pooler does not support", () => {
    expect(poolConfig(TRANSACTION_POOLER, asEnv({ DATABASE_CA_CERT: CA }))).not.toHaveProperty("statementNameGenerator");
  });
});

describe("isLocalDatabase", () => {
  it("knows this machine's addresses", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]"]) expect(isLocalDatabase(`postgresql://a:b@${host}:5432/agenda`), host).toBe(true);
  });

  it("does not take a host that only looks local", () => {
    for (const url of [DIRECT, TRANSACTION_POOLER, "postgresql://a:b@localhost.example.com/agenda", "not a url", ""]) expect(isLocalDatabase(url), url).toBe(false);
  });
});

describe("assertLocalDatabase", () => {
  it("accepts a local database outside production", () => {
    expect(() => assertLocalDatabase("O teste", asEnv({ DATABASE_URL: LOCAL }))).not.toThrow();
  });

  it("refuses production, even on a local database", () => {
    expect(() => assertLocalDatabase("O teste", asEnv({ NODE_ENV: "production", DATABASE_URL: LOCAL }))).toThrow(/produção/);
    expect(() => assertLocalDatabase("O teste", asEnv({ VERCEL_ENV: "production", DATABASE_URL: LOCAL }))).toThrow(/produção/);
  });

  it("refuses a remote database, whatever the environment", () => {
    expect(() => assertLocalDatabase("O teste", asEnv({ DATABASE_URL: DIRECT }))).toThrow(/banco remoto/);
    expect(() => assertLocalDatabase("O teste", asEnv({ VERCEL_ENV: "preview", DATABASE_URL: DIRECT }))).toThrow(/banco remoto/);
  });

  it("looks at DIRECT_URL too, the one the migration commands use", () => {
    expect(() => assertLocalDatabase("O teste", asEnv({ DATABASE_URL: LOCAL, DIRECT_URL: DIRECT }))).toThrow(/banco remoto/);
  });

  it("refuses when no URL is set", () => {
    expect(() => assertLocalDatabase("O teste", asEnv({}))).toThrow(/banco remoto/);
  });
});

describe("prisma/seed.ts", () => {
  function runSeed(env: Record<string, string>) {
    const tsx = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
    // PATH and the like stay, and the values the seed would otherwise read from .env are overridden.
    return spawnSync(process.execPath, [tsx, join("prisma", "seed.ts")], { env: { ...process.env, DIRECT_URL: "", VERCEL_ENV: "", NODE_ENV: "development", ...env }, encoding: "utf8" });
  }

  it("refuses a remote database, with the demo's password in the repository", () => {
    const result = runSeed({ DATABASE_URL: DIRECT });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("banco remoto");
  }, 60_000);

  it("refuses production, even on a local database", () => {
    const result = runSeed({ DATABASE_URL: LOCAL, VERCEL_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("produção");
  }, 60_000);
});
