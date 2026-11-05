import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { decryptSecret } from "@/lib/crypto/secrets";
import { prisma } from "@/lib/db";
import { MemoryEmailSender } from "@/lib/email/memory";
import { inngest } from "@/lib/inngest/client";
import { uniqueEmail } from "../../../tests/helpers/auth";
import { linkGoogle } from "../../../tests/helpers/google";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { AgendaError } from "@/lib/agenda/errors";
import { beginGoogleLink, completeGoogleLink, createOwnLinkRequest, describeLinkRequest, GoogleLinkError, sendGoogleLink } from "./link";
import { CALENDAR_SCOPES } from "./provider";
import { googleProviderFor } from "./index";
import { SandboxGoogleProvider, sandboxConsentCode, sandboxSubject } from "./sandbox";

// The Google link (PRD 5, Vínculo; D-01, D-04, D-59): separate from sign-in, the
// professional authorizes their own Google account, either from their profile or
// through a link the manager sends. The refresh token is stored encrypted only.

vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);

let fixture: AgendaFixture;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Vínculo Google");
});

afterEach(() => {
  delete process.env.GOOGLE_CALENDAR_PROVIDER;
  delete process.env.GOOGLE_ALLOWED_ACCOUNTS;
});

afterAll(async () => {
  await prisma.$disconnect();
});

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const tokenOf = (url: string) => url.split("/google/vincular/")[1];

/** What the browser does: start, consent with `email`, come back with the code and the cookie. */
async function authorize(token: string, email: string, provider = new SandboxGoogleProvider()) {
  const { url, cookie } = await beginGoogleLink(token, { provider });
  const state = new URL(url, "http://localhost").searchParams.get("state")!;
  return completeGoogleLink({ cookie, state, code: sandboxConsentCode(email) }, { provider });
}

describe("link sent by the manager", () => {
  it("emails the professional a 7-day link and keeps only the token's hash", async () => {
    const professional = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    const emailSender = new MemoryEmailSender();
    const now = new Date("2026-11-02T12:00:00Z");

    const { url, sentTo } = await sendGoogleLink(manager, { professionalId: fixture.professionals.ana.id }, { emailSender, now });

    expect(sentTo).toBe(professional.user.email);
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0].to).toBe(professional.user.email);
    expect(emailSender.sent[0].text).toContain(url);
    const request = await fixture.db.googleLinkRequest.findFirstOrThrow({ where: { tokenHash: hash(tokenOf(url)) } });
    expect(request.expiresAt).toEqual(new Date("2026-11-09T12:00:00Z"));
    expect(request.sentToEmail).toBe(professional.user.email);
    expect(JSON.stringify(request)).not.toContain(tokenOf(url));
    const audit = await fixture.db.auditEvent.findFirst({ where: { action: "google_link.sent", entityId: fixture.professionals.ana.id } });
    expect(audit?.changedFields).toEqual([]);
  });

  it("goes to the e-mail the manager types when the professional has no login", async () => {
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    const emailSender = new MemoryEmailSender();
    const email = uniqueEmail("dr-bruno");
    const { sentTo } = await sendGoogleLink(manager, { professionalId: fixture.professionals.bruno.id, email: ` ${email.toUpperCase()} ` }, { emailSender });
    expect(sentTo).toBe(email);
    await expect(sendGoogleLink(manager, { professionalId: fixture.professionals.bruno.id, email: "não é e-mail" }, { emailSender })).rejects.toThrow(AgendaError);
  });

  it("is only for the manager and the organization admin", async () => {
    const emailSender = new MemoryEmailSender();
    for (const role of ["SECRETARY", "PROFESSIONAL"] as const) {
      const context = await contextAs(fixture, role);
      await expect(sendGoogleLink(context, { professionalId: fixture.professionals.bruno.id, email: uniqueEmail("x") }, { emailSender })).rejects.toThrow(
        expect.objectContaining({ code: "not_allowed" }),
      );
    }
    const admin = await contextAs(fixture, "ORG_ADMIN");
    await expect(sendGoogleLink(admin, { professionalId: fixture.professionals.bruno.id, email: uniqueEmail("x") }, { emailSender })).resolves.toBeTruthy();
  });

  it("opens without login, shows practice and professional, and works once", async () => {
    const own = await createAgendaFixture("Consultório Link Único");
    const manager = await contextAs(own, "PRACTICE_MANAGER");
    const { url } = await sendGoogleLink(manager, { professionalId: own.professionals.ana.id, email: uniqueEmail("ana") }, { emailSender: new MemoryEmailSender() });
    const token = tokenOf(url);

    expect(await describeLinkRequest(token)).toEqual({ status: "pending", practiceName: "Consultório Link Único", professionalName: "Dra. Ana Teste" });
    const done = await authorize(token, uniqueEmail("ana-google"));
    expect(done).toEqual({ practiceId: own.practiceId, professionalId: own.professionals.ana.id, returnTo: "/google/vincular/concluido" });
    expect((await describeLinkRequest(token))?.status).toBe("used");
    await expect(beginGoogleLink(token, { provider: new SandboxGoogleProvider() })).rejects.toThrow(expect.objectContaining({ code: "invalid_link" }));
    expect(await describeLinkRequest("nao-existe")).toBeNull();
  });

  it("expires after 7 days", async () => {
    const own = await createAgendaFixture("Consultório Link Vencido");
    const manager = await contextAs(own, "PRACTICE_MANAGER");
    const { url } = await sendGoogleLink(manager, { professionalId: own.professionals.ana.id, email: uniqueEmail("ana") }, { emailSender: new MemoryEmailSender(), now: new Date("2026-10-01T12:00:00Z") });
    expect((await describeLinkRequest(tokenOf(url)))?.status).toBe("expired");
    await expect(beginGoogleLink(tokenOf(url), { provider: new SandboxGoogleProvider() })).rejects.toThrow(GoogleLinkError);
  });
});

describe("the professional's own link", () => {
  it("is made by the professional for their own record and returns to the profile", async () => {
    const own = await createAgendaFixture("Consultório Link Próprio");
    const professional = await contextAs(own, "PROFESSIONAL", { professionalId: own.professionals.ana.id });
    const token = await createOwnLinkRequest(professional);
    const done = await authorize(token, uniqueEmail("ana-google"));
    expect(done.returnTo).toBe(`/conta/${own.practiceId}/perfil?google=vinculado`);
  });

  it("is refused to other roles and to a professional without a record", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    await expect(createOwnLinkRequest(secretary)).rejects.toThrow(expect.objectContaining({ code: "not_allowed" }));
    const loose = await contextAs(fixture, "PROFESSIONAL");
    await expect(createOwnLinkRequest(loose)).rejects.toThrow(expect.objectContaining({ code: "professional_unavailable" }));
  });
});

describe("authorization and the connection", () => {
  it("asks only the calendar scopes of D-59, offline, with PKCE and state", async () => {
    const own = await createAgendaFixture("Consultório URL Google");
    const professional = await contextAs(own, "PROFESSIONAL", { professionalId: own.professionals.ana.id });
    const { url, cookie } = await beginGoogleLink(await createOwnLinkRequest(professional), { provider: new SandboxGoogleProvider() });
    const params = new URL(url, "http://localhost").searchParams;
    expect(params.get("state")).toMatch(/^[\w-]{40,}$/);
    expect(params.get("code_challenge")).toMatch(/^[\w-]{43}$/);
    expect(params.get("redirect_uri")).toBe("http://localhost:3000/api/google/oauth/callback");
    expect(params.get("login_hint")).toBe(professional.user.email);
    // The cookie carries the PKCE verifier and the state, encrypted.
    expect(cookie).not.toContain(params.get("state")!);
    expect(JSON.parse(decryptSecret(cookie))).toMatchObject({ state: params.get("state") });
  });

  it("stores the refresh token encrypted and links the professional", async () => {
    const own = await createAgendaFixture("Consultório Token Google");
    const professional = await contextAs(own, "PROFESSIONAL", { professionalId: own.professionals.ana.id });
    const email = uniqueEmail("ana-google");
    await authorize(await createOwnLinkRequest(professional), email);

    const row = await own.db.professional.findUniqueOrThrow({ where: { id: own.professionals.ana.id } });
    const connection = await prisma.googleConnection.findUniqueOrThrow({ where: { id: row.googleConnectionId! } });
    expect(connection.email).toBe(email);
    expect(connection.status).toBe("ACTIVE");
    expect(connection.refreshTokenEncrypted).toMatch(/^v1:/);
    expect(connection.refreshTokenEncrypted).not.toContain("sandbox-refresh");
    expect(decryptSecret(connection.refreshTokenEncrypted)).toContain("sandbox-refresh");
    expect(connection.scopes).toEqual(expect.arrayContaining([...CALENDAR_SCOPES]));
    const audit = await own.db.auditEvent.findFirst({ where: { action: "professional.google_linked", entityId: own.professionals.ana.id } });
    expect(audit?.changedFields).toEqual(["googleConnectionId"]);
  });

  it("refuses a wrong state, a denied consent and a cookie from another link", async () => {
    const own = await createAgendaFixture("Consultório Estado Google");
    const professional = await contextAs(own, "PROFESSIONAL", { professionalId: own.professionals.ana.id });
    const provider = new SandboxGoogleProvider();
    const { cookie } = await beginGoogleLink(await createOwnLinkRequest(professional), { provider });
    await expect(completeGoogleLink({ cookie, state: "outro", code: sandboxConsentCode("x@example.com") }, { provider })).rejects.toThrow(
      expect.objectContaining({ code: "invalid_state" }),
    );
    await expect(completeGoogleLink({ cookie: "lixo", state: "outro", code: "x" }, { provider })).rejects.toThrow(expect.objectContaining({ code: "invalid_state" }));
    const { url, cookie: second } = await beginGoogleLink(await createOwnLinkRequest(professional), { provider });
    const state = new URL(url, "http://localhost").searchParams.get("state")!;
    await expect(completeGoogleLink({ cookie: second, state, error: "access_denied" }, { provider })).rejects.toThrow(expect.objectContaining({ code: "denied" }));
    expect((await own.db.professional.findUniqueOrThrow({ where: { id: own.professionals.ana.id } })).googleConnectionId).toBeNull();
  });

  it("refuses a consent without every calendar scope and revokes what Google gave", async () => {
    const own = await createAgendaFixture("Consultório Escopo Google");
    const professional = await contextAs(own, "PROFESSIONAL", { professionalId: own.professionals.ana.id });
    const revoked: string[] = [];
    class PartialConsent extends SandboxGoogleProvider {
      override async exchangeCode(input: { code: string; codeVerifier: string; redirectUri: string }) {
        const tokens = await super.exchangeCode(input);
        return { ...tokens, scopes: tokens.scopes.filter((scope) => !scope.endsWith("calendar.events.readonly")) };
      }
      override async revoke(token: string) {
        revoked.push(token);
      }
    }
    await expect(authorize(await createOwnLinkRequest(professional), uniqueEmail("partial"), new PartialConsent())).rejects.toThrow(
      expect.objectContaining({ code: "missing_scopes" }),
    );
    expect(revoked).toHaveLength(1);
    expect((await own.db.professional.findUniqueOrThrow({ where: { id: own.professionals.ana.id } })).googleConnectionId).toBeNull();
  });

  it("outside production, links for real only the accounts in GOOGLE_ALLOWED_ACCOUNTS", async () => {
    const own = await createAgendaFixture("Consultório Conta Permitida");
    const professional = await contextAs(own, "PROFESSIONAL", { professionalId: own.professionals.ana.id });
    const allowed = uniqueEmail("teste-google");
    process.env.GOOGLE_CALENDAR_PROVIDER = "google";
    process.env.GOOGLE_ALLOWED_ACCOUNTS = ` ${allowed.toUpperCase()} , outra@example.com`;
    await expect(authorize(await createOwnLinkRequest(professional), uniqueEmail("medico-real"))).rejects.toThrow(
      expect.objectContaining({ code: "account_not_allowed" }),
    );
    await expect(authorize(await createOwnLinkRequest(professional), allowed)).resolves.toMatchObject({ professionalId: own.professionals.ana.id });
  });

  it("keeps a sandbox link in the sandbox while the real provider is on, outside production", async () => {
    process.env.GOOGLE_CALENDAR_PROVIDER = "google";
    expect(googleProviderFor(sandboxSubject("demo@example.com"))).toBeInstanceOf(SandboxGoogleProvider);
    expect(googleProviderFor("109876543210")).not.toBeInstanceOf(SandboxGoogleProvider);
  });

  it("shares one connection between the same person's professionals in two practices (D-04)", async () => {
    const first = await createAgendaFixture("Consultório Primeiro Vínculo");
    const second = await createAgendaFixture("Consultório Segundo Vínculo");
    const email = uniqueEmail("mesmo-medico");
    await authorize(await createOwnLinkRequest(await contextAs(first, "PROFESSIONAL", { professionalId: first.professionals.ana.id })), email);
    await authorize(await createOwnLinkRequest(await contextAs(second, "PROFESSIONAL", { professionalId: second.professionals.ana.id })), email);
    const a = await first.db.professional.findUniqueOrThrow({ where: { id: first.professionals.ana.id } });
    const b = await second.db.professional.findUniqueOrThrow({ where: { id: second.professionals.ana.id } });
    expect(a.googleConnectionId).not.toBeNull();
    expect(b.googleConnectionId).toBe(a.googleConnectionId);
  });

  it("moves to the new account on a link with another one, taking the old account's data along", async () => {
    const own = await createAgendaFixture("Consultório Revínculo");
    const professional = await contextAs(own, "PROFESSIONAL", { professionalId: own.professionals.ana.id });
    const old = await linkGoogle(own.practiceId, own.professionals.ana.id);
    await own.db.timeBlock.create({
      data: {
        practiceId: own.practiceId,
        professionalId: own.professionals.ana.id,
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        source: "GOOGLE",
        googleCalendarId: old.primaryCalendarId,
        googleEventId: "old-event",
      },
    });
    await authorize(await createOwnLinkRequest(professional), uniqueEmail("nova-conta"));

    const row = await own.db.professional.findUniqueOrThrow({ where: { id: own.professionals.ana.id } });
    expect(row.googleConnectionId).not.toBe(old.connectionId);
    expect(await own.db.googleSecondaryCalendar.count({ where: { professionalId: own.professionals.ana.id } })).toBe(0);
    expect(await own.db.timeBlock.count({ where: { professionalId: own.professionals.ana.id, source: "GOOGLE" } })).toBe(0);
  });
});
