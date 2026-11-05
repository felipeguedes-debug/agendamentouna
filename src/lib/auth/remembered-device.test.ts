import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forPractice, prisma } from "@/lib/db";
import { addMember, addOrganizationAdmin, applySetCookies, createPractice, createUser, signIn, enableTwoFactor } from "../../../tests/helpers/auth";
import { auth, SESSION_IDLE_SECONDS } from "./auth";
import { REMEMBERED_SESSION_SECONDS } from "./session-lengths";

// D-17 and D-77: 12 h of inactivity on the web, 30 days on a remembered device of the
// PWA. Only for someone who is a professional somewhere, and only after being asked.

const ORIGIN = "http://localhost:3000";
const DAY_MS = 86_400_000;

let practiceId: string;

beforeAll(async () => {
  ({ practiceId } = await createPractice("Consultório Lembrado"));
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function professionalUser(label: string) {
  const user = await createUser(label);
  await addMember(user.id, practiceId, "PROFESSIONAL");
  await forPractice(practiceId).professional.create({ data: { practiceId, name: `Dr. ${label}`, userId: user.id } });
  return user;
}

function post(path: string, cookie: string) {
  return auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { method: "POST", headers: { cookie, origin: ORIGIN, "content-type": "application/json" }, body: "{}" }));
}

function get(path: string, cookie: string) {
  return auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { headers: { cookie } }));
}

const sessionsOf = (userId: string) => prisma.session.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });

const daysFromNow = (date: Date) => (date.getTime() - Date.now()) / DAY_MS;

describe("remembered device", () => {
  it("a new session is the web's: 12 h and not remembered", async () => {
    const user = await professionalUser("web");
    await signIn(user.email);
    const [session] = await sessionsOf(user.id);
    expect(session.rememberedDevice).toBe(false);
    expect((session.expiresAt.getTime() - Date.now()) / 1000).toBeLessThanOrEqual(SESSION_IDLE_SECONDS);
  });

  it("asking extends the session and its cookie to 30 days", async () => {
    const user = await professionalUser("asks");
    const cookie = await signIn(user.email);
    const response = await post("/remember-device", cookie);
    expect(response.status).toBe(200);

    const [session] = await sessionsOf(user.id);
    expect(session.rememberedDevice).toBe(true);
    expect(daysFromNow(session.expiresAt)).toBeGreaterThan(29.9);
    expect(daysFromNow(session.expiresAt)).toBeLessThanOrEqual(30);

    const sessionCookie = response.headers.getSetCookie().find((value) => value.includes("session_token"));
    expect(sessionCookie).toMatch(new RegExp(`Max-Age=${REMEMBERED_SESSION_SECONDS}`, "i"));
  });

  it("keeps working with the same cookie, and get-session tells the screen it is remembered", async () => {
    const user = await professionalUser("keeps");
    const cookie = await signIn(user.email);
    const next = applySetCookies(cookie, (await post("/remember-device", cookie)).headers);
    const body = await (await get("/get-session", next)).json();
    expect(body.session.rememberedDevice).toBe(true);
    expect(body.user.email).toBe(user.email);
  });

  it("renews on use: asking again goes back to 30 days from now", async () => {
    const user = await professionalUser("renews");
    const cookie = await signIn(user.email);
    await post("/remember-device", cookie);
    const [session] = await sessionsOf(user.id);
    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + 10 * DAY_MS) } });
    expect((await post("/remember-device", cookie)).status).toBe(200);
    const [renewed] = await sessionsOf(user.id);
    expect(daysFromNow(renewed.expiresAt)).toBeGreaterThan(29.9);
  });

  it("is refused to someone who is not a professional anywhere, whose session stays 12 h", async () => {
    const secretary = await createUser("secretary-long");
    await addMember(secretary.id, practiceId, "SECRETARY");
    const cookie = await signIn(secretary.email);
    expect((await post("/remember-device", cookie)).status).toBe(403);
    const [session] = await sessionsOf(secretary.id);
    expect(session.rememberedDevice).toBe(false);
    expect((session.expiresAt.getTime() - Date.now()) / 1000).toBeLessThanOrEqual(SESSION_IDLE_SECONDS);
  });

  it("is refused to a professional whose access to the practice was revoked", async () => {
    const user = await createUser("revoked-long");
    await addMember(user.id, practiceId, "PROFESSIONAL", { revoked: true });
    await forPractice(practiceId).professional.create({ data: { practiceId, name: "Dr. Revogado", userId: user.id } });
    expect((await post("/remember-device", await signIn(user.email))).status).toBe(403);
  });

  it("counts an organization admin who also attends", async () => {
    const { organizationId, practiceId: ownPractice } = await createPractice("Clínica do Admin");
    const user = await createUser("admin-attends");
    await addOrganizationAdmin(user.id, organizationId);
    await forPractice(ownPractice).professional.create({ data: { practiceId: ownPractice, name: "Dra. Admin", userId: user.id } });
    expect((await post("/remember-device", await signIn(user.email))).status).toBe(200);
  });

  it("needs a session", async () => {
    expect((await post("/remember-device", "")).status).toBe(401);
  });

  it("does not cross users: it only ever touches the caller's session", async () => {
    const one = await professionalUser("one");
    const other = await professionalUser("other");
    await signIn(other.email);
    await post("/remember-device", await signIn(one.email));
    const [otherSession] = await sessionsOf(other.id);
    expect(otherSession.rememberedDevice).toBe(false);
  });

  it("signing out ends it at once", async () => {
    const user = await professionalUser("signs-out");
    const cookie = await signIn(user.email);
    await post("/remember-device", cookie);
    expect((await post("/sign-out", cookie)).status).toBe(200);
    expect(await sessionsOf(user.id)).toHaveLength(0);
  });

  it("does not pass the second factor: a new login on a user with 2FA still gets the challenge", async () => {
    const user = await professionalUser("two-factor");
    const cookie = await signIn(user.email);
    await post("/remember-device", cookie);
    await enableTwoFactor(cookie);
    const { response } = await auth.api.signInEmail({ body: { email: user.email, password: "senha-de-teste-123" }, returnHeaders: true });
    expect("twoFactorRedirect" in response && response.twoFactorRedirect).toBe(true);
  });
});
