import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auth } from "@/lib/auth/auth";
import { forPractice, prisma } from "@/lib/db";
import { addMember, applySetCookies, createPractice, createUser, setRequestCookie, signIn } from "../../../../tests/helpers/auth";
import { disablePushAction, enablePushAction, syncPushAction } from "./actions";

vi.mock("next/headers");

// Turning the notices on and off (D-78): only the caller's own session, only for someone
// who attends, only on a remembered device.

const ORIGIN = "http://localhost:3000";
const subscription = (name: string) => ({
  endpoint: `https://push.example/${name}`,
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
});

let practiceId: string;

beforeAll(async () => {
  ({ practiceId } = await createPractice("Consultório Avisos"));
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function signedInProfessional(label: string, options: { remembered?: boolean } = { remembered: true }) {
  const user = await createUser(label);
  await addMember(user.id, practiceId, "PROFESSIONAL");
  await forPractice(practiceId).professional.create({ data: { practiceId, name: `Dr. ${label}`, userId: user.id } });
  let cookie = await signIn(user.email);
  if (options.remembered) {
    const response = await auth.handler(new Request(`${ORIGIN}/api/auth/remember-device`, { method: "POST", headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(200);
    cookie = applySetCookies(cookie, response.headers);
  }
  await setRequestCookie(cookie);
  return user;
}

const rowsOf = (userId: string) => prisma.pushSubscription.findMany({ where: { userId } });

describe("enablePushAction", () => {
  it("hangs the subscription from the caller's session", async () => {
    const user = await signedInProfessional("enables");
    expect(await enablePushAction(subscription("enables"))).toEqual({});
    const [row] = await rowsOf(user.id);
    const [session] = await prisma.session.findMany({ where: { userId: user.id } });
    expect(row.sessionId).toBe(session.id);
  });

  it("is refused on a device that is not remembered, whose session would end the notices by itself", async () => {
    const user = await signedInProfessional("web-only", { remembered: false });
    expect((await enablePushAction(subscription("web-only"))).error).toBeTruthy();
    expect(await rowsOf(user.id)).toHaveLength(0);
  });

  it("is refused to someone who does not attend", async () => {
    const user = await createUser("no-attending");
    await addMember(user.id, practiceId, "SECRETARY");
    await setRequestCookie(await signIn(user.email));
    expect((await enablePushAction(subscription("no-attending"))).error).toBeTruthy();
    expect(await rowsOf(user.id)).toHaveLength(0);
  });

  it("refuses what is not a browser's subscription", async () => {
    const user = await signedInProfessional("bad-input");
    expect((await enablePushAction({ endpoint: "http://insecure.example/x" })).error).toBeTruthy();
    expect((await enablePushAction("nonsense")).error).toBeTruthy();
    expect(await rowsOf(user.id)).toHaveLength(0);
  });
});

describe("disablePushAction and syncPushAction", () => {
  it("turn off this device and tell the screen", async () => {
    const user = await signedInProfessional("disables");
    const mine = subscription("disables");
    await enablePushAction(mine);
    expect(await syncPushAction(mine)).toBe(true);
    await disablePushAction();
    expect(await rowsOf(user.id)).toHaveLength(0);
    expect(await syncPushAction(mine)).toBe(false);
  });

  it("do not reach another person's device", async () => {
    const other = await signedInProfessional("victim");
    await enablePushAction(subscription("victim"));
    await signedInProfessional("attacker");
    await disablePushAction();
    expect(await syncPushAction(subscription("victim"))).toBe(false);
    expect(await rowsOf(other.id)).toHaveLength(1);
  });
});
