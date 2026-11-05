import { execFileSync } from "node:child_process";
import path from "node:path";
import { Client } from "pg";

/**
 * Rebuilds the test database from the migrations. It only touches a database
 * whose name ends in `_test` (DATABASE_URL_TEST). Used by Vitest and Playwright,
 * which share that database, so the two never run at the same time (D-46).
 */
export async function resetTestDatabase() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error("DATABASE_URL_TEST is not set (see .env.example)");
  }
  const databaseName = new URL(url).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error(`Refusing to reset "${databaseName}": the test database name must end in _test`);
  }

  const pg = new Client({ connectionString: url });
  await pg.connect();
  try {
    await pg.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  } finally {
    await pg.end();
  }

  // Run the CLI with this Node binary instead of a shell, so no PATH lookup is involved.
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  execFileSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    // Both: the CLI prefers DIRECT_URL (D-97), and an .env that has it must not be what gets migrated here.
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: "pipe",
  });
  return url;
}
