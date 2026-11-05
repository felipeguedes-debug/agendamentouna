import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "./route";

// What an uptime monitor calls (PRD 7, Disponibilidade; D-101): the app answers and reaches the
// database. It says nothing else, because anyone can call it.

afterAll(async () => {
  await prisma.$disconnect();
});

describe("GET /api/health", () => {
  it("answers 200 when the database answers, with nothing cached", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("answers 503 when it does not, without saying why", async () => {
    const query = vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(new Error("connection to db.ref.supabase.co refused"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("supabase");
    query.mockRestore();
    warn.mockRestore();
  });
});
