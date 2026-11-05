import { execFileSync } from "node:child_process";
import path from "node:path";

/**
 * Prepares the test database in a tsx process, the way the seed runs, so the
 * Prisma client and the app modules load outside Playwright's own loader.
 */
export default function globalSetup() {
  const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  execFileSync(process.execPath, [tsx, path.join("e2e", "prepare-database.ts")], { stdio: "inherit" });
}
