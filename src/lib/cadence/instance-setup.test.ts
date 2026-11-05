import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { AgendaError } from "@/lib/agenda/errors";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/db";
import { MemoryEmailSender } from "@/lib/email/memory";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { getWhatsappInstanceSetup, parseInstanceUrl, saveWhatsappInstance } from "./instance-setup";

// The real instance is registered on the professional's screen, by the manager or the admin
// (D-94): URL, token and number. The QR Code stays on WhatsAPI's panel.

const API_URL = "https://exemplo.uazapi.com";
const PUBLIC_URL = "https://agenda.exemplo.test";

type Call = { method: string; path: string; body: unknown; token: string | null };

/** WhatsAPI as seen by the client: the status, the list of webhooks and the POST that adds one. */
function fakeWhatsapi(options: { status?: number; instanceStatus?: string; webhookStatus?: number; webhooks?: object[] } = {}) {
  const calls: Call[] = [];
  const fake = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ method: init?.method ?? "GET", path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null, token: new Headers(init?.headers).get("token") });
    if (options.status) return Response.json({ error: "Invalid token" }, { status: options.status });
    if (url.pathname === "/instance/status") return Response.json({ instance: { status: options.instanceStatus ?? "connected" } });
    if (options.webhookStatus) return Response.json({ error: "Bad webhook" }, { status: options.webhookStatus });
    if (init?.method === "POST") return Response.json({});
    return Response.json(options.webhooks ?? []);
  });
  return { fake: fake as unknown as typeof fetch, calls };
}

const webhookCall = (calls: Call[]) => calls.find((call) => call.method === "POST" && call.path === "/webhook");

let fixture: AgendaFixture;
let manager: PracticeContext;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Instância");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
});

afterEach(() => vi.unstubAllEnvs());

afterAll(async () => {
  await prisma.$disconnect();
});

const input = (overrides: Partial<Parameters<typeof saveWhatsappInstance>[2]> = {}) => ({ apiUrl: API_URL, token: "token-da-instancia", phone: "85 99988-7766", ...overrides });

describe("parseInstanceUrl", () => {
  it("keeps only the origin of an HTTPS address", () => {
    expect(parseInstanceUrl("https://exemplo.uazapi.com/")).toBe(API_URL);
    expect(parseInstanceUrl("  https://exemplo.uazapi.com/qualquer/caminho?x=1 ")).toBe(API_URL);
  });

  it.each([
    ["no scheme", "exemplo.uazapi.com"],
    ["plain HTTP", "http://exemplo.uazapi.com"],
    ["credentials in the URL", "https://usuario:senha@exemplo.uazapi.com"],
    ["localhost", "https://localhost"],
    ["a name of the machine", "https://servidor"],
    ["an internal name", "https://metadata.google.internal"],
    ["an IPv4 address", "https://169.254.169.254"],
    ["a private IPv4 address", "https://10.0.0.1"],
    ["an IPv6 address", "https://[::1]"],
    ["nothing", ""],
  ])("refuses %s, since the server calls this address with the token", (_label, url) => {
    expect(() => parseInstanceUrl(url)).toThrow(AgendaError);
  });
});

describe("saveWhatsappInstance with the real provider", () => {
  beforeEach(() => {
    vi.stubEnv("MESSAGING_PROVIDER", "whatsapi");
    vi.stubEnv("PUBLIC_WEBHOOK_URL", PUBLIC_URL);
  });

  async function professional() {
    return fixture.db.professional.create({ data: { practiceId: fixture.practiceId, name: `Profissional ${crypto.randomUUID().slice(0, 8)}` } });
  }

  it("saves the URL, the number in E.164 and only the encrypted token", async () => {
    const { id } = await professional();
    const { fake } = fakeWhatsapi();
    await saveWhatsappInstance(manager, id, input(), { fetch: fake });

    const row = await prisma.whatsappInstance.findFirstOrThrow({ where: { professionalId: id } });
    expect(row).toMatchObject({ apiUrl: API_URL, providerInstanceId: API_URL, phoneNumber: "+5585999887766" });
    expect(row.tokenEncrypted).not.toContain("token-da-instancia");
    expect(decryptSecret(row.tokenEncrypted)).toBe("token-da-instancia");
  });

  it("asks WhatsAPI with the token typed, and points the webhook at the public URL", async () => {
    const { id } = await professional();
    const { fake, calls } = fakeWhatsapi();
    await saveWhatsappInstance(manager, id, input(), { fetch: fake });
    const row = await prisma.whatsappInstance.findFirstOrThrow({ where: { professionalId: id } });

    expect(calls[0]).toMatchObject({ method: "GET", path: "/instance/status", token: "token-da-instancia" });
    expect(webhookCall(calls)?.body).toMatchObject({ action: "add", enabled: true, url: `${PUBLIC_URL}/api/webhooks/whatsapi/${row.id}` });
  });

  it("records the connection WhatsAPI reports, waiting for the QR Code or connected", async () => {
    const waiting = await professional();
    await saveWhatsappInstance(manager, waiting.id, input(), { fetch: fakeWhatsapi({ instanceStatus: "connecting" }).fake });
    expect((await prisma.whatsappInstance.findFirstOrThrow({ where: { professionalId: waiting.id } })).status).toBe("PENDING_QR");

    const connected = await professional();
    await saveWhatsappInstance(manager, connected.id, input(), { fetch: fakeWhatsapi().fake });
    expect((await prisma.whatsappInstance.findFirstOrThrow({ where: { professionalId: connected.id } })).status).toBe("CONNECTED");
  });

  it("hands over to it the dispatches planned while the professional had none", async () => {
    const appointmentDay = new Date(Date.now() + 7 * 86_400_000);
    const { id } = await professional();
    const { db, practiceId, locations, types, patient } = fixture;
    const appointment = await db.appointment.create({
      data: { practiceId, patientId: patient.id, professionalId: id, locationId: locations.aldeota.id, appointmentTypeId: types.consultation.id, startsAt: appointmentDay, endsAt: new Date(appointmentDay.getTime() + 1_800_000), durationMinutes: 30, priceCents: 0 },
    });
    const step = await db.cadenceStep.findFirstOrThrow({ where: { cadenceId: fixture.cadence.id } });
    const dispatch = await db.dispatch.create({ data: { practiceId, appointmentId: appointment.id, cadenceStepId: step.id, scheduledFor: appointmentDay, status: "SCHEDULED" } });

    await saveWhatsappInstance(manager, id, input(), { fetch: fakeWhatsapi().fake });
    const row = await prisma.whatsappInstance.findFirstOrThrow({ where: { professionalId: id } });
    expect((await db.dispatch.findFirstOrThrow({ where: { id: dispatch.id } })).whatsappInstanceId).toBe(row.id);
  });

  it("records it on the audit trail with field names only", async () => {
    const { id } = await professional();
    await saveWhatsappInstance(manager, id, input(), { fetch: fakeWhatsapi().fake });
    const row = await prisma.whatsappInstance.findFirstOrThrow({ where: { professionalId: id } });
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { practiceId: fixture.practiceId, entityType: "WhatsappInstance", entityId: row.id } });
    expect(event).toMatchObject({ action: "whatsapp_instance.registered", actorType: "USER", actorUserId: manager.user.id });
    expect(event.changedFields.sort()).toEqual(["apiUrl", "phoneNumber", "token"]);
  });

  it("saves nothing when WhatsAPI refuses the token", async () => {
    const { id } = await professional();
    await expect(saveWhatsappInstance(manager, id, input(), { fetch: fakeWhatsapi({ status: 401 }).fake })).rejects.toMatchObject({ code: "instance_token_refused" });
    expect(await prisma.whatsappInstance.count({ where: { professionalId: id } })).toBe(0);
  });

  it("saves nothing when WhatsAPI cannot be reached", async () => {
    const { id } = await professional();
    await expect(saveWhatsappInstance(manager, id, input(), { fetch: fakeWhatsapi({ status: 503 }).fake })).rejects.toMatchObject({ code: "instance_unreachable" });
    expect(await prisma.whatsappInstance.count({ where: { professionalId: id } })).toBe(0);
  });

  it("refuses without a public HTTPS address, since the patient's answers would not arrive", async () => {
    vi.stubEnv("PUBLIC_WEBHOOK_URL", "http://localhost:3000");
    const { id } = await professional();
    const { fake, calls } = fakeWhatsapi();
    await expect(saveWhatsappInstance(manager, id, input(), { fetch: fake })).rejects.toMatchObject({ code: "public_url_missing" });
    expect(calls).toHaveLength(0);
    expect(await prisma.whatsappInstance.count({ where: { professionalId: id } })).toBe(0);
  });

  it("keeps what was saved and says so when only the webhook fails, and saving again fixes it", async () => {
    const { id } = await professional();
    const outcome = await saveWhatsappInstance(manager, id, input(), { fetch: fakeWhatsapi({ webhookStatus: 500 }).fake });
    expect(outcome.webhook).toBe("failed");
    expect(await prisma.whatsappInstance.count({ where: { professionalId: id } })).toBe(1);

    const { fake, calls } = fakeWhatsapi();
    expect((await saveWhatsappInstance(manager, id, input({ token: "" }), { fetch: fake })).webhook).toBe("configured");
    expect(webhookCall(calls)).toBeDefined();
  });

  it("with a blank token keeps the one saved, and does not write it again", async () => {
    const { id } = await professional();
    await saveWhatsappInstance(manager, id, input(), { fetch: fakeWhatsapi().fake });
    const { tokenEncrypted } = await prisma.whatsappInstance.findFirstOrThrow({ where: { professionalId: id } });

    const { fake, calls } = fakeWhatsapi();
    await saveWhatsappInstance(manager, id, input({ token: "  ", phone: "85 91111-2222" }), { fetch: fake });
    const row = await prisma.whatsappInstance.findFirstOrThrow({ where: { professionalId: id } });
    expect(calls[0].token).toBe("token-da-instancia");
    expect(row.tokenEncrypted).toBe(tokenEncrypted);
    expect(row.phoneNumber).toBe("+5585911112222");
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { practiceId: fixture.practiceId, entityId: row.id, action: "whatsapp_instance.updated" } });
    expect(event.changedFields).toEqual(["phoneNumber"]);
  });

  it("on a new instance a blank token is refused", async () => {
    const { id } = await professional();
    await expect(saveWhatsappInstance(manager, id, input({ token: "" }), { fetch: fakeWhatsapi().fake })).rejects.toMatchObject({ code: "instance_token_required" });
  });

  it("refuses a number that is not a Brazilian cell phone", async () => {
    const { id } = await professional();
    await expect(saveWhatsappInstance(manager, id, input({ phone: "123" }), { fetch: fakeWhatsapi().fake })).rejects.toMatchObject({ code: "instance_phone_invalid" });
  });

  it("refuses a bad URL before calling anyone", async () => {
    const { id } = await professional();
    const { fake, calls } = fakeWhatsapi();
    await expect(saveWhatsappInstance(manager, id, input({ apiUrl: "http://exemplo.uazapi.com" }), { fetch: fake })).rejects.toMatchObject({ code: "instance_url_invalid" });
    expect(calls).toHaveLength(0);
  });

  it("does not depend on the allow list, which is about sending and not about registering", async () => {
    vi.stubEnv("MESSAGING_ALLOWED_NUMBERS", "");
    const { id } = await professional();
    await expect(saveWhatsappInstance(manager, id, input(), { fetch: fakeWhatsapi().fake })).resolves.toMatchObject({ webhook: "configured" });
  });
});

describe("saveWhatsappInstance with the sandbox", () => {
  it("needs neither WhatsAPI nor a public address", async () => {
    const { id } = await fixture.db.professional.create({ data: { practiceId: fixture.practiceId, name: "Dra. Sandbox" } });
    const fake = vi.fn() as unknown as typeof fetch;
    const outcome = await saveWhatsappInstance(manager, id, input(), { fetch: fake });
    expect(outcome.webhook).toBe("configured");
    expect(fake).not.toHaveBeenCalled();
    expect((await prisma.whatsappInstance.findFirstOrThrow({ where: { professionalId: id } })).status).toBe("PENDING_QR");
  });
});

describe("who can do it", () => {
  it.each(["SECRETARY", "PROFESSIONAL"] as const)("not the %s", async (role) => {
    const context = await contextAs(fixture, role);
    await expect(saveWhatsappInstance(context, fixture.professionals.ana.id, input())).rejects.toMatchObject({ code: "not_allowed" });
    await expect(getWhatsappInstanceSetup(context, fixture.professionals.ana.id)).rejects.toMatchObject({ code: "not_allowed" });
  });

  it("the organization's admin too", async () => {
    const context = await contextAs(fixture, "ORG_ADMIN");
    const { id } = await fixture.db.professional.create({ data: { practiceId: fixture.practiceId, name: "Dr. Admin" } });
    await expect(saveWhatsappInstance(context, id, input())).resolves.toBeDefined();
  });

  it("not on a professional of another practice", async () => {
    const other = await createAgendaFixture("Consultório Vizinho");
    await expect(saveWhatsappInstance(manager, other.professionals.ana.id, input())).rejects.toMatchObject({ code: "professional_unavailable" });
    expect(await prisma.whatsappInstance.count({ where: { professionalId: other.professionals.ana.id } })).toBe(0);
  });
});

describe("getWhatsappInstanceSetup", () => {
  it("shows the URL, the number and the status, and never the token", async () => {
    const { id } = await fixture.db.professional.create({ data: { practiceId: fixture.practiceId, name: "Dra. Tela" } });
    expect(await getWhatsappInstanceSetup(manager, id)).toBeNull();
    await saveWhatsappInstance(manager, id, input());
    const setup = await getWhatsappInstanceSetup(manager, id);
    expect(setup).toMatchObject({ apiUrl: API_URL, phoneNumber: "+5585999887766", status: "PENDING_QR" });
    expect(JSON.stringify(setup)).not.toContain("token");
    expect(JSON.stringify(setup)).not.toContain("v1:");
  });
});

describe("the disconnection alert", () => {
  it("does not go out when an instance is first saved", async () => {
    vi.stubEnv("MESSAGING_PROVIDER", "whatsapi");
    vi.stubEnv("PUBLIC_WEBHOOK_URL", PUBLIC_URL);
    const emails = new MemoryEmailSender();
    const { id } = await fixture.db.professional.create({ data: { practiceId: fixture.practiceId, name: "Dra. Sem Alerta" } });
    await saveWhatsappInstance(manager, id, input(), { fetch: fakeWhatsapi({ instanceStatus: "disconnected" }).fake, emailSender: emails });
    expect(emails.sent).toHaveLength(0);
  });
});
