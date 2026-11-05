import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { changeAppointmentStatus } from "@/lib/appointments/appointments";
import type { PracticeContext } from "@/lib/auth/access";
import { forPractice, prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { addMember, createUser } from "../../../tests/helpers/auth";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import type { PushMessage, PushProvider, PushTarget } from "./provider";
import { PUSH_CONFIRMATIONS_EVENT } from "./queue";
import { practicesWithPendingPush, sendConfirmationPushes } from "./notify";
import { SANDBOX_GONE_ENDPOINT } from "./sandbox";
import { hashEndpoint, parsePushSubscription, pruneExpiredSubscriptions, removePushSubscription, savePushSubscription, syncPushSubscription } from "./subscriptions";

// The confirmation notice (PRD 7, D-78), with the sandbox provider that records in a table.

const DAY_MS = 86_400_000;
const KEYS = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };

let send: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
});

beforeEach(() => {
  send.mockClear();
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

type Fixture = { target: AgendaFixture; professional: PracticeContext; secretary: PracticeContext };

/** A practice whose Dra. Ana has a login, and a secretary. */
async function fixtureWithProfessional(name: string): Promise<Fixture> {
  const target = await createAgendaFixture(name);
  return {
    target,
    professional: await contextAs(target, "PROFESSIONAL", { professionalId: target.professionals.ana.id }),
    secretary: await contextAs(target, "SECRETARY"),
  };
}

async function book(target: AgendaFixture, options: { hoursAhead?: number; professionalId?: string } = {}) {
  const startsAt = new Date(Date.now() + (options.hoursAhead ?? 26) * 3_600_000);
  return target.db.appointment.create({
    data: {
      practiceId: target.practiceId,
      locationId: target.locations.aldeota.id,
      professionalId: options.professionalId ?? target.professionals.ana.id,
      patientId: target.patient.id,
      appointmentTypeId: target.types.consultation.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      durationMinutes: 30,
      priceCents: 45000,
      internalNote: "Observação interna sigilosa",
    },
  });
}

async function device(userId: string, options: { endpoint?: string; expiresInMs?: number } = {}) {
  const session = await prisma.session.create({
    data: { userId, token: randomUUID(), expiresAt: new Date(Date.now() + (options.expiresInMs ?? 30 * DAY_MS)), rememberedDevice: true },
  });
  const endpoint = options.endpoint ?? `https://push.example/${randomUUID()}`;
  await savePushSubscription({ userId, sessionId: session.id }, { endpoint, ...KEYS });
  return { session, endpoint };
}

const delivered = (endpoint: string) => prisma.sandboxPushMessage.findMany({ where: { endpointHash: hashEndpoint(endpoint) } });

const confirm = (context: PracticeContext, appointmentId: string) => changeAppointmentStatus(context, { appointmentId, to: "CONFIRMED", from: "SCHEDULED" });

describe("the mark, when an appointment is confirmed", () => {
  it("is set by the secretary's confirmation, and Inngest is asked to send", async () => {
    const { target, secretary } = await fixtureWithProfessional("Push Secretária");
    const appointment = await book(target);
    await confirm(secretary, appointment.id);
    const row = await target.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } });
    expect(row.pushRequestedAt).not.toBeNull();
    expect(send).toHaveBeenCalledWith({ name: PUSH_CONFIRMATIONS_EVENT, data: { practiceId: target.practiceId } });
  });

  it("is set by the patient's WhatsApp answer and by the CRM", async () => {
    const { target } = await fixtureWithProfessional("Push Paciente");
    for (const kind of ["cadence", "crm"] as const) {
      const appointment = await book(target);
      await changeAppointmentStatus({ kind, practiceId: target.practiceId, db: target.db }, { appointmentId: appointment.id, to: "CONFIRMED", from: "SCHEDULED" });
      expect((await target.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).pushRequestedAt, kind).not.toBeNull();
    }
  });

  it("is not set for anything but a confirmation", async () => {
    const { target, secretary } = await fixtureWithProfessional("Push Outro Status");
    const appointment = await book(target);
    await changeAppointmentStatus(secretary, { appointmentId: appointment.id, to: "CANCELED_BY_PATIENT", from: "SCHEDULED" });
    expect((await target.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).pushRequestedAt).toBeNull();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ name: PUSH_CONFIRMATIONS_EVENT }));
  });

  it("is not set for a professional with no login, or when the professional confirmed it", async () => {
    const { target, secretary } = await fixtureWithProfessional("Push Sem Login");
    const bruno = await book(target, { professionalId: target.professionals.bruno.id });
    await confirm(secretary, bruno.id);
    expect((await target.db.appointment.findUniqueOrThrow({ where: { id: bruno.id } })).pushRequestedAt).toBeNull();

    const own = await createAgendaFixture("Push Própria");
    const manager = await contextAs(own, "PRACTICE_MANAGER", { professionalId: own.professionals.ana.id });
    const appointment = await book(own);
    await confirm(manager, appointment.id);
    expect((await own.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).pushRequestedAt).toBeNull();
  });

  it("does not stop the confirmation when Inngest is out", async () => {
    const { target, secretary } = await fixtureWithProfessional("Push Sem Inngest");
    const appointment = await book(target);
    send.mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down"));
    await expect(confirm(secretary, appointment.id)).resolves.toBeUndefined();
    expect(await practicesWithPendingPush()).toContainEqual({ practiceId: target.practiceId });
  });
});

describe("sendConfirmationPushes", () => {
  it("reaches every device of the professional, once", async () => {
    const { target, secretary, professional } = await fixtureWithProfessional("Push Dois Aparelhos");
    const phone = await device(professional.user.id);
    const tablet = await device(professional.user.id);
    const appointment = await book(target);
    await confirm(secretary, appointment.id);

    expect(await sendConfirmationPushes(target.practiceId)).toMatchObject({ sent: 2 });
    expect(await delivered(phone.endpoint)).toHaveLength(1);
    expect(await delivered(tablet.endpoint)).toHaveLength(1);

    // The mark is gone: running again sends nothing.
    expect(await sendConfirmationPushes(target.practiceId)).toMatchObject({ sent: 0 });
    expect((await target.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).pushRequestedAt).toBeNull();
  });

  it("says only the time: never the patient, the type, the note or the practice", async () => {
    const { target, secretary, professional } = await fixtureWithProfessional("Push Clínica Sigilosa");
    const phone = await device(professional.user.id);
    const appointment = await book(target);
    await confirm(secretary, appointment.id);
    await sendConfirmationPushes(target.practiceId);
    const [message] = await delivered(phone.endpoint);
    const everything = JSON.stringify(message);
    expect(message.title).toBe("Agenda");
    expect(message.body).toMatch(/^Um paciente confirmou o horário/);
    for (const secret of ["Maria", "Souza", "Primeira consulta", "Observação", "Sigilosa", "Aldeota", target.patient.phone]) {
      expect(everything).not.toContain(secret);
    }
    expect(message.url).toBe(`/pwa/${target.practiceId}`);
  });

  it("goes to nobody else, not another professional of the practice nor the secretary", async () => {
    const { target, secretary, professional } = await fixtureWithProfessional("Push Só Dela");
    const mine = await device(professional.user.id);
    const secretaryDevice = await device(secretary.user.id);
    const other = await contextAs(target, "PROFESSIONAL", { professionalId: target.professionals.bruno.id });
    const otherDevice = await device(other.user.id);
    await confirm(secretary, (await book(target)).id);
    await sendConfirmationPushes(target.practiceId);
    expect(await delivered(mine.endpoint)).toHaveLength(1);
    expect(await delivered(secretaryDevice.endpoint)).toHaveLength(0);
    expect(await delivered(otherDevice.endpoint)).toHaveLength(0);
  });

  it("stops at once when the person's access to the practice is revoked", async () => {
    const { target, secretary, professional } = await fixtureWithProfessional("Push Desligada");
    const phone = await device(professional.user.id);
    await confirm(secretary, (await book(target)).id);
    await prisma.membership.updateMany({ where: { userId: professional.user.id, practiceId: target.practiceId }, data: { revokedAt: new Date() } });
    expect(await sendConfirmationPushes(target.practiceId)).toMatchObject({ sent: 0 });
    expect(await delivered(phone.endpoint)).toHaveLength(0);
  });

  it("does not reach a device whose session ended by time", async () => {
    const { target, secretary, professional } = await fixtureWithProfessional("Push Expirada");
    const phone = await device(professional.user.id, { expiresInMs: -1000 });
    await confirm(secretary, (await book(target)).id);
    await sendConfirmationPushes(target.practiceId);
    expect(await delivered(phone.endpoint)).toHaveLength(0);
    expect(await pruneExpiredSubscriptions()).toBeGreaterThanOrEqual(1);
    expect(await prisma.pushSubscription.count({ where: { sessionId: phone.session.id } })).toBe(0);
  });

  it("does not reach a device after signing out, since the subscription dies with the session", async () => {
    const { target, secretary, professional } = await fixtureWithProfessional("Push Saiu");
    const phone = await device(professional.user.id);
    await prisma.session.delete({ where: { id: phone.session.id } });
    expect(await prisma.pushSubscription.count({ where: { sessionId: phone.session.id } })).toBe(0);
    await confirm(secretary, (await book(target)).id);
    expect(await sendConfirmationPushes(target.practiceId)).toMatchObject({ sent: 0 });
  });

  it("tells nothing about what changed while waiting in the queue", async () => {
    const { target, secretary, professional } = await fixtureWithProfessional("Push Mudou");
    const phone = await device(professional.user.id);
    const canceled = await book(target);
    await confirm(secretary, canceled.id);
    await changeAppointmentStatus(secretary, { appointmentId: canceled.id, to: "CANCELED_BY_PATIENT", from: "CONFIRMED" });
    const passed = await book(target);
    await confirm(secretary, passed.id);

    const afterTheVisit = new Date(passed.startsAt.getTime() + 60_000);
    expect(await sendConfirmationPushes(target.practiceId, { now: afterTheVisit })).toMatchObject({ sent: 0 });
    expect(await delivered(phone.endpoint)).toHaveLength(0);
    expect(await target.db.appointment.count({ where: { pushRequestedAt: { not: null } } })).toBe(0);
  });

  it("deletes a subscription the push service says is gone", async () => {
    const { target, secretary, professional } = await fixtureWithProfessional("Push Sumiu");
    const gone = await device(professional.user.id, { endpoint: SANDBOX_GONE_ENDPOINT });
    await confirm(secretary, (await book(target)).id);
    await sendConfirmationPushes(target.practiceId);
    expect(await prisma.pushSubscription.count({ where: { sessionId: gone.session.id } })).toBe(0);
  });

  it("loses the notice of a device that failed, keeps the others and never sends twice", async () => {
    const { target, secretary, professional } = await fixtureWithProfessional("Push Falhou");
    await device(professional.user.id);
    await device(professional.user.id);
    await confirm(secretary, (await book(target)).id);
    const failed: PushTarget[] = [];
    const sent: PushMessage[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider: PushProvider = {
      send: async (pushTarget, message) => {
        if (failed.length === 0) {
          failed.push(pushTarget);
          throw new Error("Push service answered 503");
        }
        sent.push(message);
        return "sent";
      },
    };
    expect(await sendConfirmationPushes(target.practiceId, { provider })).toMatchObject({ sent: 1 });
    expect(sent).toHaveLength(1);
    expect(await sendConfirmationPushes(target.practiceId, { provider })).toMatchObject({ sent: 0 });
    // Nothing about the device or the patient goes to the log.
    expect(JSON.stringify(warn.mock.calls)).not.toContain(failed[0].endpoint);
    warn.mockRestore();
  });
});

describe("subscriptions", () => {
  it("keep the endpoint and the keys encrypted", async () => {
    const user = await createUser("push-encrypted", { password: null });
    const { session, endpoint } = await device(user.id);
    const row = await prisma.pushSubscription.findFirstOrThrow({ where: { sessionId: session.id } });
    expect(row.keysEncrypted).not.toContain(endpoint);
    expect(row.keysEncrypted).not.toContain(KEYS.auth);
    expect(row.endpointHash).toBe(hashEndpoint(endpoint));
  });

  it("accept only what a browser gives", () => {
    const valid = { endpoint: "https://push.example/abc", keys: KEYS };
    expect(parsePushSubscription(valid)).toEqual({ endpoint: valid.endpoint, ...KEYS });
    expect(parsePushSubscription({ ...valid, endpoint: "http://push.example/abc" })).toBeNull();
    expect(parsePushSubscription({ ...valid, endpoint: 42 })).toBeNull();
    expect(parsePushSubscription({ ...valid, keys: { p256dh: "a b", auth: "c" } })).toBeNull();
    expect(parsePushSubscription({ endpoint: valid.endpoint })).toBeNull();
    expect(parsePushSubscription(null)).toBeNull();
  });

  it("move with the phone: a second login takes it, and the first person stops hearing", async () => {
    const first = await createUser("push-first", { password: null });
    const second = await createUser("push-second", { password: null });
    const { endpoint } = await device(first.id);
    const secondSession = await prisma.session.create({ data: { userId: second.id, token: randomUUID(), expiresAt: new Date(Date.now() + DAY_MS) } });
    await savePushSubscription({ userId: second.id, sessionId: secondSession.id }, { endpoint, ...KEYS });
    const rows = await prisma.pushSubscription.findMany({ where: { endpointHash: hashEndpoint(endpoint) } });
    expect(rows.map((row) => row.userId)).toEqual([second.id]);
  });

  it("are reconciled when the screen opens", async () => {
    const user = await createUser("push-sync", { password: null });
    const { session, endpoint } = await device(user.id);
    const owner = { userId: user.id, sessionId: session.id };
    expect(await syncPushSubscription(owner, { endpoint, ...KEYS })).toBe(true);

    // The browser rotated it.
    const rotated = `${endpoint}-rotated`;
    expect(await syncPushSubscription(owner, { endpoint: rotated, ...KEYS })).toBe(true);
    expect((await prisma.pushSubscription.findFirstOrThrow({ where: { sessionId: session.id } })).endpointHash).toBe(hashEndpoint(rotated));

    // The browser lost it.
    expect(await syncPushSubscription(owner, null)).toBe(false);
    expect(await prisma.pushSubscription.count({ where: { sessionId: session.id } })).toBe(0);

    // A browser subscription with no row (signed in again) stays off until the person asks.
    expect(await syncPushSubscription(owner, { endpoint, ...KEYS })).toBe(false);
    expect(await prisma.pushSubscription.count({ where: { sessionId: session.id } })).toBe(0);
  });

  it("turn off only for this session", async () => {
    const user = await createUser("push-off", { password: null });
    const phone = await device(user.id);
    const tablet = await device(user.id);
    await removePushSubscription({ sessionId: phone.session.id });
    expect(await prisma.pushSubscription.count({ where: { sessionId: phone.session.id } })).toBe(0);
    expect(await prisma.pushSubscription.count({ where: { sessionId: tablet.session.id } })).toBe(1);
  });
});

describe("a person in two practices", () => {
  it("hears from each, with the link of each", async () => {
    const one = await createAgendaFixture("Push Conta Um");
    const two = await createAgendaFixture("Push Conta Dois");
    const user = await createUser("push-two-practices", { password: null });
    await addMember(user.id, one.practiceId, "PROFESSIONAL");
    await addMember(user.id, two.practiceId, "PROFESSIONAL");
    await forPractice(one.practiceId).professional.update({ where: { id: one.professionals.ana.id }, data: { userId: user.id } });
    await forPractice(two.practiceId).professional.update({ where: { id: two.professionals.ana.id }, data: { userId: user.id } });
    const phone = await device(user.id);
    for (const target of [one, two]) {
      const secretary = await contextAs(target, "SECRETARY");
      await confirm(secretary, (await book(target)).id);
      await sendConfirmationPushes(target.practiceId);
    }
    const urls = (await delivered(phone.endpoint)).map((message) => message.url).sort();
    expect(urls).toEqual([`/pwa/${one.practiceId}`, `/pwa/${two.practiceId}`].sort());
  });
});
