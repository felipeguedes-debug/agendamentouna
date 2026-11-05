import { readFileSync } from "node:fs";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Supabase publishes the public schema over its Data API, to the roles anon and
// authenticated, and new tables are granted to them by default. There is no row-level
// security here (D-02), so a grant would open every practice's data to whoever holds the
// project's public key (D-97). The migration takes those grants away, on a database that
// has the roles. Local databases do not have them, so this test creates them for itself.

const ROLES = ["anon", "authenticated", "service_role"];
const MIGRATION = "prisma/migrations/20261103211000_close_supabase_data_api/migration.sql";

const pg = new Client({ connectionString: process.env.DATABASE_URL_TEST });

async function hasPrivilege(role: string, table: string) {
  const { rows } = await pg.query<{ allowed: boolean }>("SELECT has_table_privilege($1, $2, 'SELECT') AS allowed", [role, table]);
  return rows[0].allowed;
}

describe("the migration that closes Supabase's Data API", () => {
  beforeAll(async () => {
    await pg.connect();
    for (const role of ROLES) {
      const { rowCount } = await pg.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
      if (!rowCount) await pg.query(`CREATE ROLE ${role} NOLOGIN`);
    }
    await pg.query(`GRANT USAGE ON SCHEMA public TO ${ROLES.join(", ")}`);
    await pg.query(`GRANT ALL ON ALL TABLES IN SCHEMA public TO ${ROLES.join(", ")}`);
    await pg.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${ROLES.join(", ")}`);
  });

  afterAll(async () => {
    await pg.query(`DROP TABLE IF EXISTS "DataApiProbe"`);
    await pg.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM ${ROLES.join(", ")}`);
    await pg.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM ${ROLES.join(", ")}`);
    await pg.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM ${ROLES.join(", ")}`);
    await pg.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${ROLES.join(", ")}`);
    await pg.query(`REVOKE ALL ON SCHEMA public FROM ${ROLES.join(", ")}`);
    for (const role of ROLES) await pg.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined);
    await pg.end();
  });

  it("takes the existing tables away from the roles of the API", async () => {
    expect(await hasPrivilege("anon", `"Patient"`)).toBe(true);
    await pg.query(readFileSync(MIGRATION, "utf8"));
    for (const role of ROLES) {
      expect(await hasPrivilege(role, `"Patient"`), role).toBe(false);
      expect(await hasPrivilege(role, `"Session"`), role).toBe(false);
    }
  });

  it("keeps new tables away from them too", async () => {
    await pg.query(`CREATE TABLE "DataApiProbe" (id int)`);
    for (const role of ROLES) expect(await hasPrivilege(role, `"DataApiProbe"`), role).toBe(false);
  });
});
