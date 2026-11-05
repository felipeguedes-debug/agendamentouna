import "dotenv/config";
import { assertLocalDatabase } from "../src/lib/db/connection";

// The demo has accounts with a password that is in the repository (D-38), so the seed
// refuses anything but a database of this machine (D-98), before loading the database
// client. The first real account comes from `npm run conta:criar` (D-93).
async function main() {
  assertLocalDatabase("O seed da demo");
  const { prisma } = await import("../src/lib/db/client");
  const { seedDemo } = await import("./seed-demo");
  try {
    await seedDemo();
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
