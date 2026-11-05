import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { poolConfig } from "./connection";

export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set (see .env.example)");
  }
  return new PrismaClient({ adapter: new PrismaPg(poolConfig(connectionString)) });
}

export type BasePrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: BasePrismaClient };

/**
 * Base client: reaches every practice. Use it only in the seed, tests, auth and
 * services that are cross-practice by definition, with a comment saying why.
 * Everything else goes through `forPractice()` (D-02).
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
