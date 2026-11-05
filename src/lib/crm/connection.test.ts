import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppointment } from "@/lib/appointments/appointments";
import type { PracticeContext } from "@/lib/auth/access";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { dayAhead } from "../../../tests/helpers/cadence";
import { connectCrm, crmAccountOf, crmStateOf, failingCrm } from "../../../tests/helpers/crm";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { disconnectCrm, registerCrmWebhook, saveCrmToken } from "./connection";
import { allowedCrmContacts, crmMode, crmProviderFor, crmWebhookAddress } from "./index";
import { CRM_EXPORT_EVENT } from "./queue";
import { getCrmSettings } from "./settings";
import { FlwchatProvider } from "./flwchat";
import { SandboxCrmProvider } from "./sandbox";

// The practice's FlwChat token (PRD 11, Configurações da conta; D-67, D-68): only the
// manager gives it, it is checked before being kept, and it never leaves encrypted.

let send: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
  send.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

async function practice(name: string) {
  const fixture = await createAgendaFixture(name);
  return { fixture, manager: await contextAs(fixture, "PRACTICE_MANAGER") };
}

describe("saveCrmToken", () => {
  let fixture: AgendaFixture;
  let manager: PracticeContext;

  beforeAll(async () => {
    ({ fixture, manager } = await practice("Consultório Token"));
  });

  it("keeps the token only encrypted, and subscribes to the tag event with a secret URL", async () => {
    await saveCrmToken(manager, "  sandbox-novo-token  ");

    const account = await crmAccountOf(fixture.practiceId);
    expect(account.tokenEncrypted).not.toContain("sandbox-novo-token");
    expect(decryptSecret(account.tokenEncrypted)).toBe("sandbox-novo-token");
    expect(account.status).toBe("ACTIVE");
    expect(account.subscriptionId).toBeTruthy();
    expect(account.companyId).toBe("sandbox-novo-token");
    expect(account.webhookSecretHash).toMatch(/^[0-9a-f]{64}$/);

    const subscription = await prisma.sandboxCrmSubscription.findFirstOrThrow({ where: { accountKey: "novo-token" } });
    expect(subscription.events).toEqual(["CONTACT_TAG_UPDATE"]);
    expect(subscription.url).toMatch(/\/api\/webhooks\/synkronos\/[\w-]{32,}$/);
    expect(subscription.url).not.toContain(account.webhookSecretHash!);
  });

  it("audits without the value", async () => {
    const event = await fixture.db.auditEvent.findFirstOrThrow({ where: { action: "crm.connected" } });
    expect(event.actorUserId).toBe(manager.user.id);
    expect(JSON.stringify(event)).not.toContain("sandbox-novo-token");
  });

  it("a token of another company moves the practice, and the old subscription goes", async () => {
    await saveCrmToken(manager, "sandbox-outro-token");
    expect(await prisma.sandboxCrmSubscription.count({ where: { accountKey: "novo-token" } })).toBe(0);
    expect(await prisma.sandboxCrmSubscription.count({ where: { accountKey: "outro-token" } })).toBe(1);
    expect(await fixture.db.crmConnection.count()).toBe(1);
    expect(decryptSecret((await crmAccountOf(fixture.practiceId)).tokenEncrypted)).toBe("sandbox-outro-token");
  });

  it("the same token again keeps the account and its subscription", async () => {
    const before = await crmAccountOf(fixture.practiceId);
    await saveCrmToken(manager, "sandbox-outro-token");
    const after = await crmAccountOf(fixture.practiceId);
    expect(after.id).toBe(before.id);
    expect(after.subscriptionId).toBe(before.subscriptionId);
    expect(after.webhookSecretHash).toBe(before.webhookSecretHash);
    expect(await prisma.sandboxCrmSubscription.count({ where: { accountKey: "outro-token" } })).toBe(1);
  });

  it("is only for the manager", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    await expect(saveCrmToken(secretary, "sandbox-x")).rejects.toMatchObject({ code: "not_allowed" });
    const professional = await contextAs(fixture, "PROFESSIONAL");
    await expect(saveCrmToken(professional, "sandbox-x")).rejects.toMatchObject({ code: "not_allowed" });
  });

  it("needs a token", async () => {
    await expect(saveCrmToken(manager, "   ")).rejects.toMatchObject({ code: "crm_token_required" });
    await expect(saveCrmToken(manager, "x".repeat(2000))).rejects.toMatchObject({ code: "invalid_text" });
  });

  it("refuses a token FlwChat refuses, and keeps nothing", async () => {
    const { fixture: other, manager: otherManager } = await practice("Consultório Token Ruim");
    await expect(saveCrmToken(otherManager, "pn_bad", { provider: failingCrm(other.practiceId, "auth", ["ensureTags"]) })).rejects.toMatchObject({ code: "crm_token_refused" });
    expect(await other.db.crmConnection.count()).toBe(0);
  });

  it("says when FlwChat is down, and keeps nothing", async () => {
    const { fixture: other, manager: otherManager } = await practice("Consultório Token Fora");
    await expect(saveCrmToken(otherManager, "pn_x", { provider: failingCrm(other.practiceId, "transient", ["ensureTags"]) })).rejects.toMatchObject({ code: "crm_unavailable" });
    expect(await other.db.crmConnection.count()).toBe(0);
  });

  it("sends the future open appointments, and only those", async () => {
    const { fixture: other, manager: otherManager } = await practice("Consultório Token Futuros");
    const secretary = await contextAs(other, "SECRETARY");
    const book = async (days: number) =>
      (await createAppointment(secretary, {
        patientId: other.patient.id,
        professionalId: other.professionals.ana.id,
        locationId: other.locations.aldeota.id,
        appointmentTypeId: other.types.procedure.id,
        date: dayAhead(days),
        time: "10:00",
      })).id;
    const future = await book(5);
    const past = await book(6);
    await other.db.appointment.update({ where: { id: past }, data: { startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() - 86_000_000) } });
    expect((await crmStateOf(other.practiceId, future)).crmSyncRequestedAt).toBeNull();

    send.mockClear();
    await saveCrmToken(otherManager, "sandbox-futuros");

    expect((await crmStateOf(other.practiceId, future)).crmSyncRequestedAt).not.toBeNull();
    expect((await crmStateOf(other.practiceId, past)).crmSyncRequestedAt).toBeNull();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: CRM_EXPORT_EVENT, data: expect.objectContaining({ practiceId: other.practiceId }) }));
  });

  it("isolates the connections: one practice never reads another's", async () => {
    const { fixture: other } = await practice("Consultório Token Isolado");
    expect(await other.db.crmConnection.count()).toBe(0);
  });
});

describe("registerCrmWebhook", () => {
  it("without a public address on the real provider, connects without a webhook; the reconciliation still works", async () => {
    const { fixture, manager } = await practice("Consultório Sem URL");
    vi.stubEnv("CRM_PROVIDER", "flwchat");
    const fake = new SandboxCrmProvider(fixture.practiceId);
    const subscribe = vi.spyOn(fake, "subscribeWebhook");
    await saveCrmToken(manager, "pn_real", { provider: fake });
    expect(subscribe).not.toHaveBeenCalled();
    const account = await crmAccountOf(fixture.practiceId);
    expect(account.subscriptionId).toBeNull();
    expect(account.webhookSecretHash).toBeNull();
    expect((await getCrmSettings(manager)).webhook).toBe("no_public_url");
  });

  it("registers again with a new secret, and the old URL stops working", async () => {
    const { fixture, manager } = await practice("Consultório Registra");
    await saveCrmToken(manager, "sandbox-registra");
    const first = await crmAccountOf(fixture.practiceId);
    await registerCrmWebhook(manager);
    const second = await crmAccountOf(fixture.practiceId);
    expect(second.webhookSecretHash).not.toBe(first.webhookSecretHash);
    expect(await prisma.sandboxCrmSubscription.count({ where: { accountKey: "registra" } })).toBe(1);
  });
});

describe("disconnectCrm", () => {
  it("removes the token and the subscription, and clears what waited to go", async () => {
    const { fixture, manager } = await practice("Consultório Desconecta");
    await saveCrmToken(manager, "sandbox-desconecta");
    await fixture.db.patient.update({ where: { id: fixture.patient.id }, data: { crmSyncRequestedAt: new Date() } });

    await disconnectCrm(manager);

    expect(await fixture.db.crmConnection.count()).toBe(0);
    expect(await prisma.sandboxCrmSubscription.count({ where: { accountKey: "desconecta" } })).toBe(0);
    expect(await prisma.crmAccount.count({ where: { companyId: "sandbox-desconecta" } })).toBe(0);
    expect(await fixture.db.patient.count({ where: { crmSyncRequestedAt: { not: null } } })).toBe(0);
    expect(await fixture.db.auditEvent.count({ where: { action: "crm.disconnected" } })).toBe(1);
  });

  it("disconnects even with FlwChat down", async () => {
    const { fixture, manager } = await practice("Consultório Desconecta Fora");
    await saveCrmToken(manager, "sandbox-desconecta-fora");
    await disconnectCrm(manager, { provider: failingCrm(fixture.practiceId, "transient", ["unsubscribeWebhook"]) });
    expect(await fixture.db.crmConnection.count()).toBe(0);
  });

  it("is only for the manager", async () => {
    const { fixture } = await practice("Consultório Desconecta Sec");
    const secretary = await contextAs(fixture, "SECRETARY");
    await expect(disconnectCrm(secretary)).rejects.toMatchObject({ code: "not_allowed" });
  });
});

describe("getCrmSettings", () => {
  it("tells the situation without ever carrying the token", async () => {
    const { fixture, manager } = await practice("Consultório Situação");
    expect((await getCrmSettings(manager)).status).toBe("none");
    await connectCrm(fixture.practiceId);
    const settings = await getCrmSettings(manager);
    expect(settings.status).toBe("active");
    expect(settings.webhook).toBe("registered");
    const text = JSON.stringify(settings);
    expect(text).not.toContain(`sandbox-${fixture.practiceId}`);
    expect(text).not.toContain("tokenEncrypted");
    expect(text).not.toContain("webhookSecretHash");
    expect(text).not.toContain("v1:");
  });

  it("warns of a revoked token and counts what waits or failed", async () => {
    const { fixture, manager } = await practice("Consultório Situação Revogado");
    await connectCrm(fixture.practiceId, { status: "REVOKED" });
    await fixture.db.patient.update({ where: { id: fixture.patient.id }, data: { crmSyncRequestedAt: new Date() } });
    const settings = await getCrmSettings(manager);
    expect(settings.status).toBe("revoked");
    expect(settings.waiting).toBe(1);
  });

  it("is only for the manager", async () => {
    const { fixture } = await practice("Consultório Situação Sec");
    await expect(getCrmSettings(await contextAs(fixture, "SECRETARY"))).rejects.toMatchObject({ code: "not_allowed" });
  });
});

describe("the choice of provider (D-66)", () => {
  it("is the sandbox outside production unless asked, and production is always FlwChat", () => {
    expect(crmMode()).toBe("sandbox");
    vi.stubEnv("CRM_PROVIDER", "flwchat");
    expect(crmMode()).toBe("flwchat");
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRM_PROVIDER", "sandbox");
    vi.stubEnv("DATABASE_URL", "postgresql://agenda:segredo@banco.example/agenda?schema=public");
    expect(crmMode()).toBe("flwchat");
    expect(allowedCrmContacts()).toBeUndefined();
  });

  it("the production build of the end-to-end flows, on the test database, stays in the sandbox", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRM_PROVIDER", "sandbox");
    vi.stubEnv("DATABASE_URL", "postgresql://agenda:agenda@localhost:5432/agenda_test?schema=public");
    expect(crmMode()).toBe("sandbox");
    // Asking for FlwChat there goes to FlwChat: the exception only keeps the sandbox.
    vi.stubEnv("CRM_PROVIDER", "flwchat");
    expect(crmMode()).toBe("flwchat");
  });

  it("outside production the real client reaches only the allowed contacts", () => {
    vi.stubEnv("CRM_ALLOWED_CONTACTS", "85 99812-4455, +5511999990000, inválido");
    expect(allowedCrmContacts()).toEqual(["+5585998124455", "+5511999990000"]);
    vi.stubEnv("CRM_ALLOWED_CONTACTS", "");
    expect(allowedCrmContacts()).toEqual([]);
  });

  it("a sandbox token stays in the sandbox even with the real client on", async () => {
    const { encryptSecret } = await import("@/lib/crypto/secrets");
    vi.stubEnv("CRM_PROVIDER", "flwchat");
    expect(crmProviderFor({ tokenEncrypted: encryptSecret("sandbox-demo") })).toBeInstanceOf(SandboxCrmProvider);
    expect(crmProviderFor({ tokenEncrypted: encryptSecret("pn_real") })).toBeInstanceOf(FlwchatProvider);
  });

  it("a token that does not decrypt behaves as refused, without an exception", async () => {
    vi.stubEnv("CRM_PROVIDER", "flwchat");
    const provider = crmProviderFor({ tokenEncrypted: "seed:not-a-real-token" });
    await expect(provider.getContact("x")).rejects.toMatchObject({ kind: "auth" });
  });

  it("builds the webhook address from the public URL, and the sandbox can use the local one", () => {
    expect(crmWebhookAddress("abc")).toBe("http://localhost:3000/api/webhooks/synkronos/abc");
    vi.stubEnv("CRM_PROVIDER", "flwchat");
    expect(crmWebhookAddress("abc")).toBeNull();
    vi.stubEnv("PUBLIC_WEBHOOK_URL", "http://not-https.test");
    expect(crmWebhookAddress("abc")).toBeNull();
    vi.stubEnv("PUBLIC_WEBHOOK_URL", "https://tunnel.test");
    expect(crmWebhookAddress("abc")).toBe("https://tunnel.test/api/webhooks/synkronos/abc");
  });
});
