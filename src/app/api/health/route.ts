import { prisma } from "@/lib/db";

/** For an uptime monitor (PRD 7, Disponibilidade; D-101). Anyone can call it, so it says nothing else. */
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    // Base client: it reads no data, only whether the database answers.
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" }, { headers });
  } catch (error) {
    console.warn("Health check failed", (error as Error).name);
    return Response.json({ status: "unavailable" }, { status: 503, headers });
  }
}
