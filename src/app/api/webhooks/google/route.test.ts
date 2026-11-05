import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { linkGoogle } from "../../../../../tests/helpers/google";
import { createAgendaFixture } from "../../../../../tests/helpers/practice";
import { POST } from "./route";

// Google push notifications (PRD 5, Fluxo de dados; D-61): Google posts headers
// only. The channel id finds the calendar, and the channel token, compared in
// constant time with the stored hash, proves the post came from our channel. The
// route answers at once and asks Inngest to read the calendar.

const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
const TOKEN = "token-do-canal-de-teste";
let channelId: string;
let calendarRowId: string;
let connectionId: string;

function notify(headers: Record<string, string>) {
  return POST(new Request("http://localhost/api/webhooks/google", { method: "POST", headers }));
}

beforeAll(async () => {
  const fixture = await createAgendaFixture("Consultório Push Google");
  const linked = await linkGoogle(fixture.practiceId, fixture.professionals.ana.id);
  channelId = randomUUID();
  const row = await prisma.googleCalendar.update({
    where: { googleConnectionId_googleCalendarId: { googleConnectionId: linked.connectionId, googleCalendarId: linked.primaryCalendarId } },
    data: {
      channelId,
      channelResourceId: "resource-1",
      channelTokenHash: createHash("sha256").update(TOKEN).digest("hex"),
      channelExpiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  calendarRowId = row.id;
  connectionId = linked.connectionId;
});

beforeEach(() => {
  send.mockClear();
});

afterAll(async () => {
  send.mockRestore();
  await prisma.$disconnect();
});

describe("Google push webhook", () => {
  it("asks for the calendar to be read when Google says it changed", async () => {
    const response = await notify({ "x-goog-channel-id": channelId, "x-goog-channel-token": TOKEN, "x-goog-resource-state": "exists", "x-goog-resource-id": "resource-1" });
    expect(response.status).toBe(200);
    expect(send).toHaveBeenCalledWith({ name: "google/calendar.changed", data: { calendarId: calendarRowId, connectionId } });
  });

  it("answers the first sync message without reading anything", async () => {
    const response = await notify({ "x-goog-channel-id": channelId, "x-goog-channel-token": TOKEN, "x-goog-resource-state": "sync", "x-goog-resource-id": "resource-1" });
    expect(response.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a wrong token, an unknown channel and a post without headers", async () => {
    expect((await notify({ "x-goog-channel-id": channelId, "x-goog-channel-token": "outro", "x-goog-resource-state": "exists" })).status).toBe(401);
    expect((await notify({ "x-goog-channel-id": channelId, "x-goog-resource-state": "exists" })).status).toBe(401);
    expect((await notify({ "x-goog-channel-id": randomUUID(), "x-goog-channel-token": TOKEN, "x-goog-resource-state": "exists" })).status).toBe(404);
    expect((await notify({})).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("still answers when Inngest is unreachable: the polling reads the calendar later", async () => {
    send.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await notify({ "x-goog-channel-id": channelId, "x-goog-channel-token": TOKEN, "x-goog-resource-state": "exists" });
    expect(response.status).toBe(200);
    warn.mockRestore();
  });
});
