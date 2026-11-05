import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { savePushSubscription } from "@/lib/push/subscriptions";
import { createUser } from "../../../tests/helpers/auth";
import { listRememberedDevices, revokeRememberedDevice } from "./devices";

// D-77: a lost phone keeps its session for up to 30 days, so the person ends it from anywhere.

const DAY_MS = 86_400_000;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9)";

afterAll(async () => {
  await prisma.$disconnect();
});

function session(userId: string, options: { remembered?: boolean; userAgent?: string; expiresInMs?: number } = {}) {
  return prisma.session.create({
    data: { userId, token: randomUUID(), expiresAt: new Date(Date.now() + (options.expiresInMs ?? 10 * DAY_MS)), rememberedDevice: options.remembered ?? true, userAgent: options.userAgent ?? ANDROID },
  });
}

describe("remembered devices", () => {
  it("lists the user's live remembered sessions and marks this one", async () => {
    const user = await createUser("devices", { password: null });
    const phone = await session(user.id, { userAgent: IPHONE });
    const tablet = await session(user.id);
    await session(user.id, { remembered: false });
    await session(user.id, { expiresInMs: -1000 });
    const list = await listRememberedDevices(user.id, phone.id);
    expect(list.map((device) => device.id).sort()).toEqual([phone.id, tablet.id].sort());
    expect(list.find((device) => device.id === phone.id)).toMatchObject({ label: "iPhone ou iPad", current: true });
    expect(list.find((device) => device.id === tablet.id)).toMatchObject({ label: "Android", current: false });
  });

  it("ends a session and its notices", async () => {
    const user = await createUser("devices-end", { password: null });
    const phone = await session(user.id);
    await savePushSubscription({ userId: user.id, sessionId: phone.id }, { endpoint: `https://push.example/${randomUUID()}`, p256dh: "abc", auth: "def" });
    expect(await revokeRememberedDevice(user.id, phone.id)).toBe(true);
    expect(await prisma.session.count({ where: { id: phone.id } })).toBe(0);
    expect(await prisma.pushSubscription.count({ where: { userId: user.id } })).toBe(0);
  });

  it("does not reach another person's session, nor an ordinary one", async () => {
    const owner = await createUser("devices-owner", { password: null });
    const other = await createUser("devices-other", { password: null });
    const phone = await session(owner.id);
    const web = await session(other.id, { remembered: false });
    expect(await revokeRememberedDevice(other.id, phone.id)).toBe(false);
    expect(await revokeRememberedDevice(other.id, web.id)).toBe(false);
    expect(await prisma.session.count({ where: { id: { in: [phone.id, web.id] } } })).toBe(2);
  });
});
