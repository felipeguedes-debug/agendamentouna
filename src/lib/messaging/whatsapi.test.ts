import { describe, expect, it, vi } from "vitest";
import { MessagingError } from "./provider";
import { WhatsapiProvider } from "./whatsapi";

// The WhatsAPI (uazapi) client against a simulated server: the requests follow the
// OpenAPI of uazapiGO 2.6.9 and the answers map to the cadence's error kinds.

type Call = { url: string; init: RequestInit };

function server(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return { calls, fetch: fetcher as unknown as typeof fetch };
}

/** A simulated server answering 200 with a body per "METHOD /path". */
function routes(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const body = answers[`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`] ?? {};
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  return { calls, fetch: fetcher as unknown as typeof fetch };
}

function client(fake: { fetch: typeof fetch }, allowedNumbers?: string[]) {
  return new WhatsapiProvider({ apiUrl: "https://free.uazapi.test/", token: "instance-token", fetch: fake.fetch, allowedNumbers });
}

async function kindOf(promise: Promise<unknown>) {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error instanceof MessagingError ? error.kind : `other: ${(error as Error).message}`;
  }
}

describe("WhatsapiProvider", () => {
  it("sends a text with the instance token and our tracking id, and keeps the WhatsApp message id", async () => {
    const fake = server(200, { id: "5585999990000:3EB0ABC", messageid: "3EB0ABC", status: "Sent", response: { status: "success" } });
    const result = await client(fake).sendText({ to: "+5585998124455", text: "Olá, Maria", trackId: "dispatch-1" });

    expect(result).toEqual({ providerMessageId: "3EB0ABC" });
    expect(fake.calls[0].url).toBe("https://free.uazapi.test/send/text");
    expect(fake.calls[0].init.method).toBe("POST");
    expect(fake.calls[0].init.headers).toMatchObject({ token: "instance-token", "Content-Type": "application/json" });
    expect(JSON.parse(String(fake.calls[0].init.body))).toEqual({
      number: "5585998124455",
      text: "Olá, Maria",
      linkPreview: false,
      track_source: "agenda-consultorios",
      track_id: "dispatch-1",
    });
  });

  it("refuses numbers outside the allowed list before calling the server", async () => {
    const fake = server(200, { messageid: "x" });
    expect(await kindOf(client(fake, ["+5585911112222"]).sendText({ to: "+5585998124455", text: "Oi" }))).toBe("rejected");
    expect(fake.calls).toHaveLength(0);
    expect(await kindOf(client(fake, ["+5585911112222"]).sendText({ to: "+5585911112222", text: "Oi" }))).toBe("ok");
  });

  it("maps the server's answers to disconnected, transient and rejected", async () => {
    const send = (status: number, body: unknown) => kindOf(client(server(status, body)).sendText({ to: "+5585998124455", text: "Oi" }));
    expect(await send(401, { error: "Invalid token" })).toBe("disconnected");
    expect(await send(409, { error: "Instance not paired", code: "instance_not_paired" })).toBe("disconnected");
    expect(await send(400, { error: "WhatsApp disconnected" })).toBe("disconnected");
    expect(await send(500, { error: "Failed to send message" })).toBe("transient");
    expect(await send(429, { error: "Rate limit exceeded" })).toBe("transient");
    expect(await send(400, { error: "Missing number or text" })).toBe("rejected");
    expect(await send(200, { status: "Sent" })).toBe("transient");
  });

  it("treats a network failure as transient", async () => {
    const failing = { fetch: (async () => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch };
    expect(await kindOf(client(failing).sendText({ to: "+5585998124455", text: "Oi" }))).toBe("transient");
  });

  it("reads the instance connection", async () => {
    expect(await client(server(200, { instance: { status: "connected" }, status: { connected: true } })).getConnection()).toBe("connected");
    expect(await client(server(200, { instance: { status: "connecting" } })).getConnection()).toBe("connecting");
    expect(await client(server(200, { instance: { status: "hibernated" } })).getConnection()).toBe("disconnected");
    const fake = server(200, { instance: { status: "disconnected" } });
    await client(fake).getConnection();
    expect(fake.calls[0]).toMatchObject({ url: "https://free.uazapi.test/instance/status", init: { method: "GET" } });
  });

  it("adds our webhook next to another system's, never replacing it", async () => {
    const fake = routes({ "GET /webhook": [{ id: "other", enabled: true, url: "https://crm.example/hook", events: ["messages"] }], "POST /webhook": {} });
    await client(fake).configureWebhook("https://agenda.test/api/webhooks/whatsapi/abc");
    expect(fake.calls.map((call) => `${call.init.method} ${call.url}`)).toEqual(["GET https://free.uazapi.test/webhook", "POST https://free.uazapi.test/webhook"]);
    expect(JSON.parse(String(fake.calls[1].init.body))).toEqual({
      action: "add",
      enabled: true,
      url: "https://agenda.test/api/webhooks/whatsapi/abc",
      events: ["messages", "messages_update", "connection"],
      excludeMessages: ["isGroupYes"],
    });
  });

  it("updates our own webhook when the public URL changes", async () => {
    const fake = routes({ "GET /webhook": [{ id: "ours", enabled: true, url: "https://old-tunnel.test/api/webhooks/whatsapi/abc" }], "POST /webhook": {} });
    await client(fake).configureWebhook("https://new-tunnel.test/api/webhooks/whatsapi/abc");
    expect(JSON.parse(String(fake.calls[1].init.body))).toMatchObject({ action: "update", id: "ours", url: "https://new-tunnel.test/api/webhooks/whatsapi/abc" });
  });
});
