import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedPushUsers, pushMode, pushProvider } from "./index";
import { SandboxPushProvider } from "./sandbox";
import { WebPushProvider } from "./web-push";

// The real provider, with the library replaced: nothing leaves the machine (D-78).

const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({ default: { sendNotification } }));

const KEYS = { publicKey: "public", privateKey: "private", subject: "mailto:test@example.com" };
const TARGET = { endpoint: "https://push.example/abc", p256dh: "key", auth: "secret" };
const MESSAGE = { title: "Agenda", body: "Um paciente confirmou o horário das 14:30.", url: "/pwa/1", tag: "confirmacao-1", ttlSeconds: 3600 };

afterEach(() => {
  vi.unstubAllEnvs();
  sendNotification.mockReset();
});

describe("WebPushProvider", () => {
  const provider = new WebPushProvider(KEYS);

  it("sends the payload, with the lifetime and the keys apart from it", async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    expect(await provider.send(TARGET, MESSAGE)).toBe("sent");
    const [subscription, payload, options] = sendNotification.mock.calls[0];
    expect(subscription).toEqual({ endpoint: TARGET.endpoint, keys: { p256dh: "key", auth: "secret" } });
    expect(JSON.parse(payload)).toEqual({ title: MESSAGE.title, body: MESSAGE.body, url: MESSAGE.url, tag: MESSAGE.tag });
    expect(options).toEqual({ TTL: 3600, vapidDetails: KEYS });
  });

  it("reads 404 and 410 as a subscription that no longer exists", async () => {
    for (const statusCode of [404, 410]) {
      sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode }));
      expect(await provider.send(TARGET, MESSAGE)).toBe("gone");
    }
  });

  it("throws anything else without carrying the endpoint in the message", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error(`failed for ${TARGET.endpoint}`), { statusCode: 503 }));
    const error = await provider.send(TARGET, MESSAGE).catch((caught: Error) => caught);
    expect((error as Error).message).toBe("Push service answered 503");
  });
});

describe("the choice of provider", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "postgresql://agenda:agenda@db.example:5432/agenda");
  });

  it("is the sandbox by default outside production", () => {
    vi.stubEnv("PUSH_PROVIDER", "");
    expect(pushMode()).toBe("sandbox");
    expect(pushProvider()).toBeInstanceOf(SandboxPushProvider);
    expect(allowedPushUsers()).toBeUndefined();
  });

  it("delivers for real only when asked, and only to the listed users", () => {
    vi.stubEnv("PUSH_PROVIDER", "webpush");
    vi.stubEnv("PUSH_ALLOWED_USERS", "Teste@Example.com, outra@example.com");
    vi.stubEnv("VAPID_PUBLIC_KEY", "public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "private");
    vi.stubEnv("VAPID_SUBJECT", "mailto:test@example.com");
    expect(pushMode()).toBe("webpush");
    expect(pushProvider()).toBeInstanceOf(WebPushProvider);
    expect(allowedPushUsers()).toEqual(["teste@example.com", "outra@example.com"]);
  });

  it("reaches nobody when the real delivery has no list", () => {
    vi.stubEnv("PUSH_PROVIDER", "webpush");
    vi.stubEnv("PUSH_ALLOWED_USERS", "");
    expect(allowedPushUsers()).toEqual([]);
  });

  it("is always real in production, with no list, and refuses to start without keys", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VAPID_PUBLIC_KEY", "");
    expect(pushMode()).toBe("webpush");
    expect(allowedPushUsers()).toBeUndefined();
    expect(() => pushProvider()).toThrow(/VAPID/);
  });

  it("stays in the sandbox on the production build of the end-to-end flows", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "postgresql://agenda:agenda@127.0.0.1:5432/agenda_test?schema=public");
    expect(pushMode()).toBe("sandbox");
  });
});
