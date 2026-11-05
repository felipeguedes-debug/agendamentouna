import "dotenv/config";
import { resetTestDatabase } from "./reset-test-database";

/** Rebuilds the test database from the migrations before every Vitest run. */
export default async function setup() {
  await resetTestDatabase();
}
