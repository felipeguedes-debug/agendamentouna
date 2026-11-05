import "dotenv/config";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { assertMigratable, migrationDatabaseUrl } from "../src/lib/db/connection";

/**
 * Applies the migrations (D-97), in the deploy's build or by hand:
 *
 *   npm run db:deploy
 *
 * Refuses the transaction pooler before Prisma tries it, because there the advisory lock
 * of `prisma migrate deploy` would not hold, and the error would not say why.
 */

try {
  assertMigratable(migrationDatabaseUrl());
  // Run the CLI with this Node binary instead of a shell, so no PATH lookup is involved.
  execFileSync(process.execPath, [path.join(process.cwd(), "node_modules", "prisma", "build", "index.js"), "migrate", "deploy"], { stdio: "inherit" });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
