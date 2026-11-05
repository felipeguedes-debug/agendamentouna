import "dotenv/config";
import { assertLocalDatabase } from "../src/lib/db/connection";

/**
 * Comes before the commands that wipe or rewrite a database (`db:reset`, `db:migrate`), in
 * package.json (D-98). The seed checks for itself, but `prisma migrate reset` would already
 * have emptied the database by then.
 */

try {
  assertLocalDatabase("Este comando");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
