import "dotenv/config";
import { defineConfig } from "prisma/config";
import { migrationDatabaseUrl } from "./src/lib/db/connection";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not env(): that throws when the variable is missing, which would break
    // `prisma generate` in the postinstall of a fresh clone without .env.
    // The app goes through the transaction pooler, where a migration cannot run (D-97).
    url: migrationDatabaseUrl(),
  },
});
