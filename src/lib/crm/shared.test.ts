import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createAppointment } from "@/lib/appointments/appointments";
import type { PracticeContext } from "@/lib/auth/access";
import { forPractice, prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { createCadence, createPatient, createTypeWithCadence, dayAhead, dispatchesOf, openWindowAllDay } from "../../../tests/helpers/cadence";
import { crmContactOf, failingCrm } from "../../../tests/helpers/crm";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { disconnectCrm, saveCrmToken } from "./connection";
import { applyContactCommands } from "./inbound";
import { exportToCrm } from "./outbound";
import { CRM_COMMAND_TAGS } from "./rules";
import { applySandboxTag, putSandboxContact, SandboxCrmProvider, sandboxWebhookBody } from "./sandbox";
import { getCrmSettings } from "./settings";
import { handleCrmWebhook } from "./webhook";

// One SynkronosCRM account serving several practices (D-73): the real account has
// hundreds of thousands of contacts and over a hundred numbers. The same patient may
// be in two practices, and each practice must see only what is its own.

const ACCOUNT = "conta-compartilhada";
const TOKEN = `sandbox-${ACCOUNT}`;
let nextDay = 30;

type Side = { fixture: AgendaFixture; manager: PracticeContext; secretary: PracticeContext; typeId: string };

async function side(name: string, number: string): Promise<Side> {
  const fixture = await createAgendaFixture(name);
  await openWindowAllDay(fixture.practiceId);
  await fixture.db.whatsappInstance.create({
    data: { practiceId: fixture.practiceId, professionalId: fixture.professionals.ana.id, providerInstanceId: `shared-${name}`, apiUrl: "https://whatsapi.test", tokenEncrypted: "x", phoneNumber: number, status: "CONNECTED" },
  });
  const cadence = await createCadence(fixture.practiceId, `Régua ${name}`, [
    { anchor: "APPOINTMENT", offsetMinutes: -2880, action: "REQUEST_CONFIRMATION" },
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", action: "REQUEST_CONFIRMATION" },
  ]);
  const typeId = (await createTypeWithCadence(fixture.practiceId, `Consulta ${name}`, cadence.id)).id;
  return { fixture, manager: await contextAs(fixture, "PRACTICE_MANAGER"), secretary: await contextAs(fixture, "SECRETARY"), typeId };
}

let clinicA: Side;
let clinicB: Side;
const NUMBER_A = "+5585900001111";
const NUMBER_B = "+5585900002222";

beforeAll(async () => {
  vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
  clinicA = await side("Clínica A", NUMBER_A);
  clinicB = await side("Clínica B", NUMBER_B);
  await saveCrmToken(clinicA.manager, TOKEN);
  await saveCrmToken(clinicB.manager, TOKEN);
});

beforeEach(() => {
  vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

async function accountOf(practiceId: string) {
  const connection = await forPractice(practiceId).crmConnection.findFirstOrThrow();
  return prisma.crmAccount.findUniqueOrThrow({ where: { id: connection.crmAccountId } });
}

async function book(clinic: Side, patientId: string) {
  const { id } = await createAppointment(clinic.secretary, {
    patientId,
    professionalId: clinic.fixture.professionals.ana.id,
    locationId: clinic.fixture.locations.aldeota.id,
    appointmentTypeId: clinic.typeId,
    date: dayAhead(nextDay++),
    time: "10:00",
  });
  return id;
}

async function markSent(clinic: Side, appointmentId: string, sentAt: Date) {
  const first = (await dispatchesOf(clinic.fixture.practiceId, appointmentId))[0];
  await clinic.fixture.db.dispatch.update({ where: { id: first.id }, data: { status: "SENT", sentAt } });
}

let phoneCounter = 1;
const uniquePhone = () => `+55859876${String(5000 + phoneCounter++).padStart(5, "0")}`;

const statusOf = async (clinic: Side, id: string) => (await clinic.fixture.db.appointment.findUniqueOrThrow({ where: { id } })).status;

describe("the connection", () => {
  it("two practices with a token of the same company share one account and one subscription", async () => {
    const [a, b] = await Promise.all([accountOf(clinicA.fixture.practiceId), accountOf(clinicB.fixture.practiceId)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.crmAccount.count({ where: { companyId: `sandbox-${ACCOUNT}` } })).toBe(1);
    expect(await prisma.sandboxCrmSubscription.count({ where: { accountKey: ACCOUNT } })).toBe(1);
  });

  it("a practice joining an account creates no tags: the API's list is cached and it accepts duplicates (D-70)", async () => {
    const joining = await side("Clínica Junta", "+5585900008888");
    const provider = new SandboxCrmProvider(ACCOUNT);
    const ensureTags = vi.spyOn(provider, "ensureTags");
    await saveCrmToken(joining.manager, TOKEN, { provider });
    expect(ensureTags).not.toHaveBeenCalled();
    expect((await accountOf(joining.fixture.practiceId)).companyId).toBe(`sandbox-${ACCOUNT}`);
    await disconnectCrm(joining.manager);
  });

  it("a token the API refuses does not join the account, and does not touch it", async () => {
    const joining = await side("Clínica Token Ruim", "+5585900009999");
    const before = await accountOf(clinicA.fixture.practiceId);
    await expect(saveCrmToken(joining.manager, "pn_ruim", { provider: failingCrm(ACCOUNT, "auth", ["companyId"]) })).rejects.toMatchObject({ code: "crm_token_refused" });
    expect(await joining.fixture.db.crmConnection.count()).toBe(0);
    expect((await accountOf(clinicA.fixture.practiceId)).tokenEncrypted).toBe(before.tokenEncrypted);
  });

  it("disconnecting one practice keeps the account for the other; the last one takes it away", async () => {
    const one = await side("Clínica Sai 1", "+5585900003333");
    const two = await side("Clínica Sai 2", "+5585900004444");
    const token = "sandbox-conta-que-sai";
    await saveCrmToken(one.manager, token);
    await saveCrmToken(two.manager, token);
    const account = await accountOf(one.fixture.practiceId);

    await disconnectCrm(one.manager);
    expect(await one.fixture.db.crmConnection.count()).toBe(0);
    expect(await prisma.crmAccount.findUnique({ where: { id: account.id } })).not.toBeNull();
    expect(await prisma.sandboxCrmSubscription.count({ where: { accountKey: "conta-que-sai" } })).toBe(1);

    await disconnectCrm(two.manager);
    expect(await prisma.crmAccount.findUnique({ where: { id: account.id } })).toBeNull();
    expect(await prisma.sandboxCrmSubscription.count({ where: { accountKey: "conta-que-sai" } })).toBe(0);
  });

  it("a practice that moves to another account leaves the old one", async () => {
    const one = await side("Clínica Muda", "+5585900005555");
    await saveCrmToken(one.manager, "sandbox-conta-velha");
    const old = await accountOf(one.fixture.practiceId);
    await saveCrmToken(one.manager, "sandbox-conta-nova");
    expect((await accountOf(one.fixture.practiceId)).id).not.toBe(old.id);
    expect(await prisma.crmAccount.findUnique({ where: { id: old.id } })).toBeNull();
    expect(await prisma.sandboxCrmSubscription.count({ where: { accountKey: "conta-velha" } })).toBe(0);
  });

  it("a refused token warns both practices, and a new one from either brings both back", async () => {
    const one = await side("Clínica Token 1", "+5585900006666");
    const two = await side("Clínica Token 2", "+5585900007777");
    await saveCrmToken(one.manager, "sandbox-conta-token");
    await saveCrmToken(two.manager, "sandbox-conta-token");
    const patient = await createPatient(one.fixture.practiceId);
    await book(one, patient.id);

    await exportToCrm(one.fixture.practiceId, { provider: failingCrm("conta-token", "auth", ["findContactByPhone", "createContact"]) });

    expect((await getCrmSettings(one.manager)).status).toBe("revoked");
    expect((await getCrmSettings(two.manager)).status).toBe("revoked");
    await saveCrmToken(two.manager, "sandbox-conta-token");
    expect((await getCrmSettings(one.manager)).status).toBe("active");
  });

  it("tells each manager that the account is shared, and shows only the practice's own commands", async () => {
    const settings = await getCrmSettings(clinicA.manager);
    expect(settings.sharedWith).toBe(1);
    const patient = await createPatient(clinicB.fixture.practiceId, { name: "Só da Clínica B" });
    await markSent(clinicB, await book(clinicB, patient.id), new Date());
    const contact = await putSandboxContact(ACCOUNT, { name: "B", phone: patient.phone!, tags: [CRM_COMMAND_TAGS.confirm] });
    const account = await accountOf(clinicB.fixture.practiceId);
    await applyContactCommands(account.id, { contactId: contact.id, origin: "webhook" });

    expect((await getCrmSettings(clinicB.manager)).recent.some((event) => event.patientName === "Só da Clínica B")).toBe(true);
    expect((await getCrmSettings(clinicA.manager)).recent.some((event) => event.patientName === "Só da Clínica B")).toBe(false);
    expect(JSON.stringify(await getCrmSettings(clinicA.manager))).not.toContain("tokenEncrypted");
  });
});

describe("a command on a contact that is a patient in two practices (D-08, D-73)", () => {
  async function samePatient(phone: string) {
    const inA = await createPatient(clinicA.fixture.practiceId, { phone, name: "Paciente em A" });
    const inB = await createPatient(clinicB.fixture.practiceId, { phone, name: "Paciente em B" });
    return { inA, inB };
  }

  it("goes to the practice of the latest cadence message, and the other practice does not change", async () => {
    const phone = uniquePhone();
    const { inA, inB } = await samePatient(phone);
    const inClinicA = await book(clinicA, inA.id);
    const inClinicB = await book(clinicB, inB.id);
    await markSent(clinicA, inClinicA, new Date(Date.now() - 3_600_000));
    await markSent(clinicB, inClinicB, new Date());
    const contact = await putSandboxContact(ACCOUNT, { name: "Duas", phone, tags: [CRM_COMMAND_TAGS.confirm] });
    const account = await accountOf(clinicA.fixture.practiceId);

    const results = await applyContactCommands(account.id, { contactId: contact.id, origin: "webhook" });

    expect(results).toEqual([{ command: "confirm", outcome: "confirmed", appointmentId: inClinicB }]);
    expect(await statusOf(clinicB, inClinicB)).toBe("CONFIRMED");
    expect(await statusOf(clinicA, inClinicA)).toBe("SCHEDULED");
    expect(await clinicB.fixture.db.crmInboundEvent.count({ where: { appointmentId: inClinicB } })).toBe(1);
    expect(await clinicA.fixture.db.crmInboundEvent.count({ where: { patientId: inA.id } })).toBe(0);
  });

  it("when the latest message's appointment passed, does not fall back to the other practice", async () => {
    const phone = uniquePhone();
    const { inA, inB } = await samePatient(phone);
    const inClinicA = await book(clinicA, inA.id);
    const inClinicB = await book(clinicB, inB.id);
    await markSent(clinicA, inClinicA, new Date(Date.now() - 3_600_000));
    await markSent(clinicB, inClinicB, new Date());
    await clinicB.fixture.db.appointment.update({ where: { id: inClinicB }, data: { startsAt: new Date(Date.now() - 86_400_000), endsAt: new Date(Date.now() - 86_000_000) } });
    const contact = await putSandboxContact(ACCOUNT, { name: "Duas", phone, tags: [CRM_COMMAND_TAGS.confirm] });
    const account = await accountOf(clinicA.fixture.practiceId);

    const results = await applyContactCommands(account.id, { contactId: contact.id, origin: "webhook" });

    expect(results[0].outcome).toBe("appointment_passed");
    expect(await statusOf(clinicA, inClinicA)).toBe("SCHEDULED");
  });

  it("through the webhook, reaches the practice of the latest message whichever practice connected first", async () => {
    const phone = uniquePhone();
    const { inA, inB } = await samePatient(phone);
    const inClinicA = await book(clinicA, inA.id);
    const inClinicB = await book(clinicB, inB.id);
    await markSent(clinicB, inClinicB, new Date(Date.now() - 3_600_000));
    await markSent(clinicA, inClinicA, new Date());
    const contact = await putSandboxContact(ACCOUNT, { name: "Duas", phone });
    await applySandboxTag(ACCOUNT, contact.id, CRM_COMMAND_TAGS.confirm);
    const secret = "segredo-compartilhado";
    const account = await accountOf(clinicA.fixture.practiceId);
    const { createHash } = await import("node:crypto");
    await prisma.crmAccount.update({ where: { id: account.id }, data: { webhookSecretHash: createHash("sha256").update(secret).digest("hex") } });

    const answer = await handleCrmWebhook(secret, await sandboxWebhookBody(ACCOUNT, contact.id));

    expect(answer.status).toBe(200);
    expect(await statusOf(clinicA, inClinicA)).toBe("CONFIRMED");
    expect(await statusOf(clinicB, inClinicB)).toBe("SCHEDULED");
  });

  it("a contact that is no patient in any of the practices does nothing, and says so", async () => {
    const phone = uniquePhone();
    const contact = await putSandboxContact(ACCOUNT, { name: "Ninguém", phone, tags: [CRM_COMMAND_TAGS.confirm] });
    const account = await accountOf(clinicA.fixture.practiceId);
    const results = await applyContactCommands(account.id, { contactId: contact.id, origin: "webhook" });
    expect(results).toEqual([{ command: "confirm", outcome: "unknown_contact", appointmentId: null }]);
    const after = (await crmContactOf(ACCOUNT, phone))!;
    expect(after.tagNames).toEqual([]);
    expect(after.notes.at(-1)!.text).toContain("nenhum paciente");
  });
});

describe("what the contact shows across practices (D-73)", () => {
  it("the status tag is that of the next appointment in any of the practices", async () => {
    const phone = uniquePhone();
    const inA = await createPatient(clinicA.fixture.practiceId, { phone });
    const inB = await createPatient(clinicB.fixture.practiceId, { phone });
    const later = await book(clinicA, inA.id);
    await exportToCrm(clinicA.fixture.practiceId);
    expect((await crmContactOf(ACCOUNT, phone))!.tagNames).toEqual(["Agenda: Agendado"]);

    // Practice B's appointment is sooner, and confirmed.
    const sooner = await createAppointment(clinicB.secretary, {
      patientId: inB.id,
      professionalId: clinicB.fixture.professionals.ana.id,
      locationId: clinicB.fixture.locations.aldeota.id,
      appointmentTypeId: clinicB.typeId,
      date: dayAhead(2),
      time: "10:00",
    });
    const { changeAppointmentStatus } = await import("@/lib/appointments/appointments");
    await changeAppointmentStatus(clinicB.secretary, { appointmentId: sooner.id, to: "CONFIRMED" });
    await exportToCrm(clinicB.fixture.practiceId);
    expect((await crmContactOf(ACCOUNT, phone))!.tagNames).toEqual(["Agenda: Confirmado"]);

    // Practice A exporting again does not take it back: B's is still the next one.
    await clinicA.fixture.db.appointment.update({ where: { id: later }, data: { crmSyncRequestedAt: new Date() } });
    await exportToCrm(clinicA.fixture.practiceId);
    expect((await crmContactOf(ACCOUNT, phone))!.tagNames).toEqual(["Agenda: Confirmado"]);
  });

  it("never renames a contact the CRM already has: another practice may know it by another name", async () => {
    const phone = uniquePhone();
    const inA = await createPatient(clinicA.fixture.practiceId, { phone, name: "Nome na Clínica A" });
    await putSandboxContact(ACCOUNT, { name: "Nome que já estava lá", phone });
    await book(clinicA, inA.id);
    await exportToCrm(clinicA.fixture.practiceId);
    expect((await crmContactOf(ACCOUNT, phone))!.name).toBe("Nome que já estava lá");
  });
});

describe("the note goes to the conversation with the professional's number (D-68, D-73)", () => {
  it("writes on that number's conversation, never on the latest one of another practice", async () => {
    const phone = uniquePhone();
    const inA = await createPatient(clinicA.fixture.practiceId, { phone });
    await putSandboxContact(ACCOUNT, { name: "Duas conversas", phone, conversationNumbers: [NUMBER_B, NUMBER_A] });
    await book(clinicA, inA.id);
    await exportToCrm(clinicA.fixture.practiceId);
    const contact = (await crmContactOf(ACCOUNT, phone))!;
    expect(contact.notes).toHaveLength(1);
    expect(contact.notes[0].channelNumber).toBe(NUMBER_A);
  });

  it("leaves the note out when the contact never talked to that number, and still applies the tag", async () => {
    const phone = uniquePhone();
    const inA = await createPatient(clinicA.fixture.practiceId, { phone });
    await putSandboxContact(ACCOUNT, { name: "Só com B", phone, conversationNumbers: [NUMBER_B] });
    const appointmentId = await book(clinicA, inA.id);
    const summary = await exportToCrm(clinicA.fixture.practiceId);
    expect(summary.failed).toBe(0);
    const contact = (await crmContactOf(ACCOUNT, phone))!;
    expect(contact.notes).toHaveLength(0);
    expect(contact.tagNames).toEqual(["Agenda: Agendado"]);
    expect((await clinicA.fixture.db.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).crmSyncRequestedAt).toBeNull();
  });

  it("leaves the note out when the professional has no WhatsApp number", async () => {
    const phone = uniquePhone();
    const inA = await createPatient(clinicA.fixture.practiceId, { phone });
    const { id } = await createAppointment(clinicA.secretary, {
      patientId: inA.id,
      professionalId: clinicA.fixture.professionals.bruno.id,
      locationId: clinicA.fixture.locations.aldeota.id,
      appointmentTypeId: clinicA.typeId,
      date: dayAhead(nextDay++),
      time: "10:00",
    });
    await exportToCrm(clinicA.fixture.practiceId);
    expect((await crmContactOf(ACCOUNT, phone))!.notes).toHaveLength(0);
    expect((await clinicA.fixture.db.appointment.findUniqueOrThrow({ where: { id } })).crmSyncRequestedAt).toBeNull();
  });

  it("the manual contact's note goes to the number of the appointment's professional", async () => {
    const phone = uniquePhone();
    const inA = await createPatient(clinicA.fixture.practiceId, { phone });
    const appointmentId = await book(clinicA, inA.id);
    await markSent(clinicA, appointmentId, new Date());
    const contact = await putSandboxContact(ACCOUNT, { name: "Manual", phone, tags: [CRM_COMMAND_TAGS.manual_contact], conversationNumbers: [NUMBER_B, NUMBER_A] });
    const account = await accountOf(clinicA.fixture.practiceId);
    await applyContactCommands(account.id, { contactId: contact.id, origin: "webhook" });
    const notes = (await crmContactOf(ACCOUNT, phone))!.notes;
    expect(notes.at(-1)!.channelNumber).toBe(NUMBER_A);
  });
});

describe("what a real account's webhook brings (D-73)", () => {
  it("ignores, without a call to the CRM, the tag changes of contacts with no command", async () => {
    const secret = "segredo-do-silencio";
    const account = await accountOf(clinicA.fixture.practiceId);
    const { createHash } = await import("node:crypto");
    await prisma.crmAccount.update({ where: { id: account.id }, data: { webhookSecretHash: createHash("sha256").update(secret).digest("hex") } });
    const answer = await handleCrmWebhook(
      secret,
      { eventType: "CONTACT_TAG_UPDATE", date: "x", content: { id: "alguem", companyId: `sandbox-${ACCOUNT}`, tags: ["CAMPANHA"] } },
      { provider: failingCrm(ACCOUNT, "transient", ["getContact"]) },
    );
    expect(answer).toEqual({ status: 200, body: { ok: true, ignored: true } });
  });
});
