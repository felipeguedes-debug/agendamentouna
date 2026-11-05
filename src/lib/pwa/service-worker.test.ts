import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

// public/sw.js, run in a fake service worker scope (D-76, D-78). Patient data is
// sensitive (PRD 7): the worker keeps only the offline page and an icon, and never
// stores a screen or a response. The flow in a real browser is in e2e/pwa.spec.ts.

const SOURCE = readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
const ORIGIN = "https://agenda.example";

type Listener = (event: FakeEvent) => void;
type FakeEvent = Record<string, unknown> & { waitUntil: (promise: Promise<unknown>) => void; respondWith?: (response: unknown) => void };

function worker(network: (request: unknown) => Promise<unknown>) {
  const listeners = new Map<string, Listener>();
  const stored = new Map<string, Map<string, unknown>>();
  const cacheOf = (name: string) => {
    if (!stored.has(name)) stored.set(name, new Map());
    const entries = stored.get(name)!;
    return {
      addAll: vi.fn(async (urls: string[]) => {
        for (const url of urls) entries.set(url, `cached ${url}`);
      }),
      put: vi.fn(async (request: string, response: unknown) => {
        entries.set(String(request), response);
      }),
      match: vi.fn(async (url: string) => entries.get(url)),
    };
  };
  const caches = {
    open: vi.fn(async (name: string) => cacheOf(name)),
    keys: vi.fn(async () => [...stored.keys()]),
    delete: vi.fn(async (name: string) => stored.delete(name)),
    match: vi.fn(async (url: string) => {
      for (const entries of stored.values()) if (entries.has(url)) return entries.get(url);
      return undefined;
    }),
  };
  const showNotification = vi.fn(async () => undefined);
  const windows: { url: string; focus: ReturnType<typeof vi.fn> }[] = [];
  const clients = {
    claim: vi.fn(async () => undefined),
    matchAll: vi.fn(async () => windows),
    openWindow: vi.fn(async () => null),
  };
  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(async () => undefined),
    clients,
    registration: { showNotification },
    location: { origin: ORIGIN },
  };
  const fetch = vi.fn(network);
  vm.runInNewContext(SOURCE, { self, caches, clients, fetch, URL, Promise, JSON });

  async function fire(type: string, fields: Record<string, unknown> = {}) {
    const waited: Promise<unknown>[] = [];
    let responded: Promise<unknown> | undefined;
    const event: FakeEvent = {
      ...fields,
      waitUntil: (promise) => {
        waited.push(Promise.resolve(promise));
      },
      respondWith: (response) => {
        responded = Promise.resolve(response);
      },
    };
    listeners.get(type)?.(event);
    await Promise.all(waited);
    return { responded: responded ? await responded : undefined, wasAnswered: responded !== undefined };
  }
  return { fire, fetch, stored, caches, showNotification, clients, windows };
}

const navigation = (url = `${ORIGIN}/pwa/123`) => ({ mode: "navigate", url, method: "GET" });

describe("what the service worker keeps", () => {
  it("precaches only the offline page and an icon", async () => {
    const sw = worker(async () => "network");
    await sw.fire("install");
    const cached = [...sw.stored.values()].flatMap((entries) => [...entries.keys()]);
    expect(cached.sort()).toEqual(["/icons/icon-192.png", "/offline.html"]);
  });

  it("never stores a screen: the network answers and the cache stays the same", async () => {
    const sw = worker(async () => "agenda with patient names");
    await sw.fire("install");
    const before = [...sw.stored.values()].flatMap((entries) => [...entries.keys()]);
    const { responded } = await sw.fire("fetch", { request: navigation() });
    expect(responded).toBe("agenda with patient names");
    expect([...sw.stored.values()].flatMap((entries) => [...entries.keys()])).toEqual(before);
  });

  it("does not touch anything but navigations: Server Actions, RSC, API and files go straight to the network", async () => {
    const sw = worker(async () => "network");
    await sw.fire("install");
    for (const request of [
      { mode: "cors", url: `${ORIGIN}/pwa/123?_rsc=abc`, method: "GET" },
      { mode: "cors", url: `${ORIGIN}/pwa/123`, method: "POST" },
      { mode: "same-origin", url: `${ORIGIN}/api/auth/get-session`, method: "GET" },
      { mode: "no-cors", url: `${ORIGIN}/_next/static/chunk.js`, method: "GET" },
    ]) {
      expect((await sw.fire("fetch", { request })).wasAnswered).toBe(false);
    }
    expect(sw.fetch).not.toHaveBeenCalled();
  });

  it("answers a failed navigation with the offline page, which has no data", async () => {
    const sw = worker(async () => {
      throw new TypeError("offline");
    });
    await sw.fire("install");
    const { responded } = await sw.fire("fetch", { request: navigation() });
    expect(responded).toBe("cached /offline.html");
  });

  it("removes the caches of earlier versions when it activates", async () => {
    const sw = worker(async () => "network");
    await sw.fire("install");
    (await sw.caches.open("agenda-offline-v0")).addAll(["/old.html"]);
    await sw.fire("activate");
    expect(sw.caches.delete).toHaveBeenCalledWith("agenda-offline-v0");
    expect([...sw.stored.keys()]).toHaveLength(1);
    expect(sw.clients.claim).toHaveBeenCalled();
  });
});

describe("notifications", () => {
  const payload = { title: "Agenda", body: "Um paciente confirmou o horário das 14:30.", url: "/pwa/123", tag: "confirmacao-1" };
  const pushEvent = (json: unknown) => ({ data: { json: () => json } });

  it("shows what the server sent, with the link kept for the click", async () => {
    const sw = worker(async () => "network");
    await sw.fire("push", pushEvent(payload));
    expect(sw.showNotification).toHaveBeenCalledOnce();
    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, { body: string; tag: string; data: { url: string } }];
    expect(title).toBe("Agenda");
    expect(options).toMatchObject({ body: payload.body, tag: payload.tag, data: { url: "/pwa/123" } });
  });

  it("still shows something on a push it cannot read, as browsers demand, without inventing content", async () => {
    const sw = worker(async () => "network");
    await sw.fire("push", {
      data: {
        json: () => {
          throw new SyntaxError("bad");
        },
      },
    });
    const [title, options] = sw.showNotification.mock.calls[0] as unknown as [string, { body: string; data: { url: string } }];
    expect(title).toBe("Agenda");
    expect(options.body).toBe("Há novidades na sua agenda.");
    expect(options.data.url).toBe("/pwa");
  });

  const click = (url: unknown) => ({ notification: { close: vi.fn(), data: { url } } });

  it("opens the screen of the notification", async () => {
    const sw = worker(async () => "network");
    await sw.fire("notificationclick", click("/pwa/123"));
    expect(sw.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/pwa/123`);
  });

  it("focuses the app when that screen is already open", async () => {
    const sw = worker(async () => "network");
    const focus = vi.fn(async () => undefined);
    sw.windows.push({ url: `${ORIGIN}/pwa/123`, focus });
    await sw.fire("notificationclick", click("/pwa/123"));
    expect(focus).toHaveBeenCalled();
    expect(sw.clients.openWindow).not.toHaveBeenCalled();
  });

  it("never opens another site, whatever the payload says", async () => {
    const sw = worker(async () => "network");
    for (const url of ["https://evil.example/", "//evil.example/", "javascript:alert(1)", 42, undefined]) {
      await sw.fire("notificationclick", click(url));
    }
    for (const [target] of sw.clients.openWindow.mock.calls as unknown as string[][]) {
      expect(target).toBe(`${ORIGIN}/pwa`);
    }
  });
});

describe("offline page", () => {
  const html = readFileSync(path.join(process.cwd(), "public", "offline.html"), "utf8");

  it("says there is no connection and depends on nothing else", () => {
    expect(html).toContain("Sem conexão");
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    expect(html).not.toMatch(/<script[^>]+src=/);
  });
});
