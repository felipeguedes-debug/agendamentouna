import { describe, expect, it, vi } from "vitest";
import { FlwchatProvider } from "./flwchat";
import { CrmError } from "./provider";

// The FlwChat client against a simulated server. Paths and fields follow the OpenAPI
// of docs/flwchat.md; what the documentation leaves open was measured in the real
// test (D-70).

type Call = { url: string; init: RequestInit };

/** Answers per "METHOD /path": a body (200) or [status, body]. */
function server(answers: Record<string, unknown>) {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const answer = answers[`${init?.method ?? "GET"} ${new URL(String(url)).pathname}`];
    const [status, body] = Array.isArray(answer) && typeof answer[0] === "number" ? (answer as [number, unknown]) : [200, answer ?? {}];
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  return { calls, fetch: fetcher as unknown as typeof fetch };
}

const client = (fake: { fetch: typeof fetch }, allowedContacts?: string[]) =>
  new FlwchatProvider({ apiUrl: "https://api.flw.test/", token: "pn_secret-token", fetch: fake.fetch, allowedContacts });

const bodyOf = (call: Call) => JSON.parse(String(call.init.body)) as Record<string, unknown>;
const CONTACT = { id: "c1", name: "Maria", phoneNumber: "+55|85998124455", tagNames: ["Lead"] };
const MARIA = { id: "c1", phone: "+5585998124455" };

async function kindOf(promise: Promise<unknown>) {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error instanceof CrmError ? error.kind : `other: ${(error as Error).message}`;
  }
}

describe("FlwchatProvider", () => {
  it("authenticates with the permanent token as a bearer, on each module's prefix", async () => {
    const fake = server({ "GET /core/v1/contact/c1": CONTACT, "GET /chat/v2/session": { items: [] } });
    await client(fake).getContact("c1");
    await client(fake).addNote(MARIA, "x", { channelNumber: null });

    expect(fake.calls[0].url).toBe("https://api.flw.test/core/v1/contact/c1?IncludeDetails=Tags");
    expect(new Headers(fake.calls[0].init.headers).get("authorization")).toBe("Bearer pn_secret-token");
    expect(new URL(fake.calls[1].url).pathname).toBe("/chat/v2/session");
  });

  it("reads a contact, with the phone in E.164 and its tags", async () => {
    const fake = server({ "GET /core/v1/contact/c1": CONTACT });
    expect(await client(fake).getContact("c1")).toEqual({ id: "c1", name: "Maria", phone: "+5585998124455", tags: ["Lead"] });
  });

  it("answers null for a contact that is not there, which the API tells with a 500", async () => {
    const fake = server({
      "GET /core/v1/contact/c8": [404, { error: true }],
      "GET /core/v1/contact/c9": [500, { httpStatusCode: "INTERNALSERVERERROR", key: "ENTITY_NOT_FOUND", text: "Contato não encontrado", error: true }],
    });
    expect(await client(fake).getContact("c8")).toBeNull();
    expect(await client(fake).getContact("c9")).toBeNull();
  });

  it("finds a contact by phone, trying the number with and without the ninth digit", async () => {
    const fake = server({
      // As the real API answers an unknown number: a form error on a 500.
      "GET /core/v1/contact/phonenumber/5585998124455": [500, { httpStatusCode: "INTERNALSERVERERROR", key: "FORM_ERROR", text: "Contato não encontrado", error: true }],
      "GET /core/v1/contact/phonenumber/558598124455": { ...CONTACT, phoneNumber: "+55|8598124455" },
    });
    expect((await client(fake).findContactByPhone("+5585998124455"))?.id).toBe("c1");
    expect(fake.calls).toHaveLength(2);
  });

  it("creates a contact without touching what a contact of that number already has", async () => {
    const fake = server({ "POST /core/v1/contact": CONTACT });
    expect((await client(fake).createContact({ name: "Maria", phone: "+5585998124455" })).id).toBe("c1");
    expect(bodyOf(fake.calls[0])).toEqual({ name: "Maria", phoneNumber: "5585998124455", options: { getIfExists: true } });
  });

  it("updates only the phone of a contact: the name is the CRM's", async () => {
    const fake = server({ "PUT /core/v2/contact/c1": CONTACT });
    await client(fake).updateContactPhone("c1", "+5585998124455");
    expect(bodyOf(fake.calls[0])).toEqual({ fields: ["PhoneNumber"], phoneNumber: "5585998124455" });
  });

  it("tells the company from a contact, or else from a subscription", async () => {
    const withContact = server({ "POST /core/v1/contact/filter": { items: [{ id: "c1", companyId: "company-1" }] } });
    expect(await client(withContact).companyId()).toBe("company-1");
    expect(bodyOf(withContact.calls[0])).toEqual({ pageNumber: 1, pageSize: 1 });
    const withSubscription = server({ "POST /core/v1/contact/filter": { items: [] }, "GET /core/v1/webhook/subscription": [{ id: "s1", companyId: "company-2" }] });
    expect(await client(withSubscription).companyId()).toBe("company-2");
    const empty = server({ "POST /core/v1/contact/filter": { items: [] }, "GET /core/v1/webhook/subscription": [] });
    expect(await client(empty).companyId()).toBeNull();
  });

  it("adds and removes tags by name, leaving the contact's other tags alone", async () => {
    const fake = server({});
    await client(fake).updateTags(MARIA, { add: ["Agenda: Confirmado"], remove: ["Agenda: Agendado"] });

    const [removal, addition] = fake.calls;
    expect(new URL(removal.url).pathname).toBe("/core/v1/contact/c1/tags");
    expect(bodyOf(removal)).toEqual({ tagNames: ["Agenda: Agendado"], operation: "DeleteIfExists" });
    expect(bodyOf(addition)).toEqual({ tagNames: ["Agenda: Confirmado"], operation: "InsertIfNotExists" });
  });

  it("does not call the API when there is nothing to change in the tags", async () => {
    const fake = server({});
    await client(fake).updateTags(MARIA, { add: [], remove: [] });
    expect(fake.calls).toHaveLength(0);
  });

  const SESSIONS = {
    items: [
      { id: "s-old", createdAt: "2026-01-01T00:00:00Z", lastInteractionDate: "2026-01-02T00:00:00Z" },
      { id: "s-new", createdAt: "2026-01-01T00:00:00Z", lastInteractionDate: "2026-03-01T00:00:00Z" },
    ],
  };
  const CHANNELS = [
    { id: "ch-instagram", type: "Instagram", number: null },
    { id: "ch-a", type: "ZAPI_WhatsApp", number: "+55|85900001111" },
    { id: "ch-b", type: "ZAPI_WhatsApp", number: "+55|8590002222" },
  ];

  it("puts a note in the latest conversation with the professional's number, and only there (D-73)", async () => {
    const fake = server({ "GET /chat/v1/channel": CHANNELS, "GET /chat/v2/session": SESSIONS, "POST /chat/v1/session/s-new/note": { id: "n1" } });
    expect(await client(fake).addNote(MARIA, "Agenda: Confirmado", { channelNumber: "+5585900001111" })).toEqual({ noteId: "n1" });

    const listing = new URL(fake.calls[1].url);
    expect(listing.searchParams.get("ContactId")).toBe("c1");
    expect(listing.searchParams.get("Type")).toBe("INDIVIDUAL");
    expect(listing.searchParams.get("ChannelsId")).toBe("ch-a");
    expect(bodyOf(fake.calls[2])).toEqual({ text: "Agenda: Confirmado" });
  });

  it("recognizes a channel's number with or without the ninth digit", async () => {
    const fake = server({ "GET /chat/v1/channel": CHANNELS, "GET /chat/v2/session": SESSIONS, "POST /chat/v1/session/s-new/note": { id: "n1" } });
    await client(fake).addNote(MARIA, "x", { channelNumber: "+5585990002222" });
    expect(new URL(fake.calls[1].url).searchParams.get("ChannelsId")).toBe("ch-b");
  });

  it("reads the account's channels once per provider", async () => {
    const fake = server({ "GET /chat/v1/channel": CHANNELS, "GET /chat/v2/session": SESSIONS, "POST /chat/v1/session/s-new/note": { id: "n1" } });
    const provider = client(fake);
    await provider.addNote(MARIA, "x", { channelNumber: "+5585900001111" });
    await provider.addNote(MARIA, "y", { channelNumber: "+5585900001111" });
    expect(fake.calls.filter((call) => new URL(call.url).pathname === "/chat/v1/channel")).toHaveLength(1);
  });

  it("writes no note when the account has no channel with that number, or no conversation on it", async () => {
    const noChannel = server({ "GET /chat/v1/channel": CHANNELS });
    expect(await client(noChannel).addNote(MARIA, "x", { channelNumber: "+5511999990000" })).toBeNull();
    expect(noChannel.calls).toHaveLength(1);
    const noConversation = server({ "GET /chat/v1/channel": CHANNELS, "GET /chat/v2/session": { items: [] } });
    expect(await client(noConversation).addNote(MARIA, "x", { channelNumber: "+5585900001111" })).toBeNull();
  });

  it("without a number goes to the latest conversation of all, for what says nothing of an appointment", async () => {
    const fake = server({ "GET /chat/v2/session": SESSIONS, "POST /chat/v1/session/s-new/note": { id: "n1" } });
    expect(await client(fake).addNote(MARIA, "A etiqueta não foi aplicada", { channelNumber: null })).toEqual({ noteId: "n1" });
    expect(new URL(fake.calls[0].url).searchParams.has("ChannelsId")).toBe(false);
  });

  it("deletes a note, and takes a note already gone as done", async () => {
    const fake = server({ "DELETE /chat/v1/session/note/n2": [404, { error: true }] });
    await client(fake).deleteNote("n1");
    await client(fake).deleteNote("n2");
    expect(new URL(fake.calls[0].url).pathname).toBe("/chat/v1/session/note/n1");
  });

  it("creates only the tags that are missing", async () => {
    const fake = server({ "GET /core/v1/tag": [{ id: "t1", name: "Agenda: Agendado" }], "POST /core/v1/tag": { id: "t2" } });
    await client(fake).ensureTags([
      { name: "Agenda: Agendado", color: "BLUE_500" },
      { name: "Confirmar na agenda", color: "GREEN_500" },
    ]);
    const posts = fake.calls.filter((call) => call.init.method === "POST");
    expect(posts).toHaveLength(1);
    expect(bodyOf(posts[0])).toEqual({ name: "Confirmar na agenda", color: "GREEN_500" });
  });

  it("does not create a tag that exists in another case: the API accepts duplicates", async () => {
    const fake = server({ "GET /core/v1/tag": [{ id: "t1", name: "CONFIRMAR NA AGENDA" }] });
    await client(fake).ensureTags([{ name: "Confirmar na agenda", color: "BLUE_500" }]);
    expect(fake.calls.filter((call) => call.init.method === "POST")).toHaveLength(0);
  });

  it("subscribes only to the event of the tags, and removes the subscription", async () => {
    const fake = server({ "POST /core/v1/webhook/subscription": { id: "sub1", companyId: "company-1" } });
    expect(await client(fake).subscribeWebhook("https://agenda.test/api/webhooks/synkronos/secret")).toEqual({ subscriptionId: "sub1", companyId: "company-1" });
    expect(bodyOf(fake.calls[0])).toEqual({ name: "Agenda de consultórios", url: "https://agenda.test/api/webhooks/synkronos/secret", events: ["CONTACT_TAG_UPDATE"], enabled: true });

    await client(fake).unsubscribeWebhook("sub1");
    expect(fake.calls[1].init.method).toBe("DELETE");
    expect(new URL(fake.calls[1].url).pathname).toBe("/core/v1/webhook/subscription/sub1");
  });

  it("maps the answers to the integration's error kinds", async () => {
    const answering = (status: number) => server({ "GET /core/v1/tag": [status, { error: true, text: "nope" }] });
    expect(await kindOf(client(answering(401)).ensureTags([]))).toBe("auth");
    expect(await kindOf(client(answering(403)).ensureTags([]))).toBe("auth");
    expect(await kindOf(client(answering(429)).ensureTags([]))).toBe("rate_limited");
    expect(await kindOf(client(answering(500)).ensureTags([]))).toBe("transient");
    expect(await kindOf(client(answering(503)).ensureTags([]))).toBe("transient");
    expect(await kindOf(client(answering(400)).ensureTags([]))).toBe("rejected");
  });

  it("does not take a refused form for a CRM that is down, though the API answers both with 500", async () => {
    const refused = server({ "GET /core/v1/tag": [500, { httpStatusCode: "INTERNALSERVERERROR", key: "FORM_ERROR", text: "Telefone inválido", error: true }] });
    expect(await kindOf(client(refused).ensureTags([]))).toBe("rejected");
    const missing = server({ "GET /core/v1/tag": [500, { httpStatusCode: "INTERNALSERVERERROR", key: "ENTITY_NOT_FOUND", text: "Contato não encontrado", error: true }] });
    expect(await kindOf(client(missing).ensureTags([]))).toBe("not_found");
    const broken = server({ "GET /core/v1/tag": [500, { httpStatusCode: "INTERNALSERVERERROR", key: "SOMETHING_BROKE", text: "Erro", error: true }] });
    expect(await kindOf(client(broken).ensureTags([]))).toBe("transient");
  });

  it("treats a network failure as transient", async () => {
    const fake = { fetch: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch };
    expect(await kindOf(client(fake).ensureTags([]))).toBe("transient");
  });

  it("never puts the token in an error", async () => {
    const fake = server({ "GET /core/v1/tag": [401, { text: "invalid" }] });
    const error = await client(fake).ensureTags([]).catch((failure: Error) => failure);
    expect((error as Error).message).not.toContain("pn_secret-token");
  });

  it("outside production reaches only the allowed contacts, for every write and for the lookup by phone", async () => {
    const fake = server({ "POST /core/v1/contact": CONTACT });
    const other = { id: "c2", phone: "+5585911112222" };
    const limited = client(fake, ["+5585998124455"]);

    expect(await kindOf(limited.createContact({ name: "Outro", phone: other.phone }))).toBe("rejected");
    expect(await kindOf(limited.updateContactPhone(other.id, other.phone))).toBe("rejected");
    expect(await kindOf(limited.updateTags(other, { add: ["a"], remove: [] }))).toBe("rejected");
    expect(await kindOf(limited.addNote(other, "x", { channelNumber: null }))).toBe("rejected");
    expect(await kindOf(limited.findContactByPhone(other.phone))).toBe("rejected");
    expect(fake.calls).toHaveLength(0);

    expect(await kindOf(limited.createContact({ name: "Maria", phone: "+5585998124455" }))).toBe("ok");
  });

  it("outside production refuses to hand over a contact read by id that is not allowed", async () => {
    const fake = server({ "GET /core/v1/contact/c1": CONTACT, "GET /core/v1/contact/c2": { ...CONTACT, id: "c2", phoneNumber: "+55|85911112222" } });
    const limited = client(fake, ["+5585998124455"]);
    expect((await limited.getContact("c1"))?.id).toBe("c1");
    expect(await kindOf(limited.getContact("c2"))).toBe("rejected");
  });

  it("recognizes an allowed contact with or without the ninth digit", async () => {
    const fake = server({ "POST /core/v1/contact/c3/tags": {} });
    await client(fake, ["+5585998124455"]).updateTags({ id: "c3", phone: "+558598124455" }, { add: ["a"], remove: [] });
    expect(fake.calls).toHaveLength(1);
  });

  it("with an empty allowed list reaches no contact", async () => {
    const fake = server({});
    expect(await kindOf(client(fake, []).updateTags(MARIA, { add: ["a"], remove: [] }))).toBe("rejected");
    expect(fake.calls).toHaveLength(0);
  });
});
