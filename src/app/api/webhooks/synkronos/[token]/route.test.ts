import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { changeAppointmentStatus, createAppointment } from "@/lib/appointments/appointments";
import type { PracticeContext } from "@/lib/auth/access";
import { exportToCrm } from "@/lib/crm/outbound";
import type { CrmSync } from "@/lib/crm/provider";
import { CRM_CONTACT_CHECK_EVENT } from "@/lib/crm/queue";
import { CRM_COMMAND_TAGS } from "@/lib/crm/rules";
import { applySandboxTag, putSandboxContact, sandboxWebhookBody } from "@/lib/crm/sandbox";
import { prisma } from "@/lib/db";
import { inngest } from "@/lib/inngest/client";
import { addInstance, createCadence, createPatient, createTypeWithCadence, dayAhead, dispatchesOf, openWindowAllDay } from "../../../../../../tests/helpers/cadence";
import { connectCrm, crmContactOf, failingCrm } from "../../../../../../tests/helpers/crm";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../../../../tests/helpers/practice";
import { POST } from "./route";

// A provider for the calls that must fail; the route has no way in, by design.
const override = vi.hoisted(() => ({ provider: undefined as CrmSync | undefined }));
vi.mock("@/lib/crm/index", async (original) => {
  const actual = await original<typeof import("@/lib/crm/index")>();
  return { ...actual, crmProviderFor: (account: { tokenEncrypted: string }) => override.provider ?? actual.crmProviderFor(account) };
});

// The webhook of SynkronosCRM (D-05, D-66, D-67). Block 7 done criterion: a
// confirmation made in the CRM stops the cadence.

let fixture: AgendaFixture;
let secretary: PracticeContext;
let secret: string;
let accountId: string;
let typeId: string;
let practiceId: string;
let nextDay = 8;
let send: ReturnType<typeof vi.spyOn>;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Webhook CRM");
  practiceId = fixture.practiceId;
  await openWindowAllDay(practiceId);
  await addInstance(practiceId, fixture.professionals.ana.id);
  ({ secret, accountId } = await connectCrm(practiceId));
  const cadence = await createCadence(practiceId, "Webhook CRM", [
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", action: "REQUEST_CONFIRMATION" },
    { anchor: "APPOINTMENT", offsetMinutes: -180, action: "REQUEST_CONFIRMATION" },
    { anchor: "APPOINTMENT", offsetMinutes: -2880, eligibleStatuses: ["SCHEDULED", "CONFIRMED"], action: "REMINDER" },
  ]);
  typeId = (await createTypeWithCadence(practiceId, "Consulta webhook CRM", cadence.id)).id;
  secretary = await contextAs(fixture, "SECRETARY");
});

beforeEach(() => {
  send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
  send.mockClear();
  override.provider = undefined;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.$disconnect();
});

function post(body: unknown, token = secret) {
  const request = new Request(`http://localhost/api/webhooks/synkronos/${token}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  return POST(request, { params: Promise.resolve({ token }) });
}

/** An appointment whose confirmation request went out, with its patient's contact in the CRM. */
async function bookWithSentRequest() {
  const patient = await createPatient(practiceId);
  const { id } = await createAppointment(secretary, {
    patientId: patient.id,
    professionalId: fixture.professionals.ana.id,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: typeId,
    date: dayAhead(nextDay++),
    time: "10:00",
  });
  const request = (await dispatchesOf(practiceId, id)).find((row) => row.cadenceStep?.offsetMinutes === -1440)!;
  await fixture.db.dispatch.update({ where: { id: request.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: `3EB0${request.id.slice(0, 8)}` } });
  await exportToCrm(practiceId);
  const contact = (await crmContactOf(practiceId, patient.phone!))!;
  return { patient, appointmentId: id, contact };
}

async function tagAndBody(contactId: string, tag: string) {
  await applySandboxTag(practiceId, contactId, tag);
  return sandboxWebhookBody(practiceId, contactId);
}

const statusOf = async (id: string) => (await fixture.db.appointment.findUniqueOrThrow({ where: { id } })).status;

describe("POST /api/webhooks/synkronos/[token]", () => {
  it("confirms and stops the cadence when the secretary tags the contact (done criterion)", async () => {
    const { appointmentId, contact } = await bookWithSentRequest();
    const body = await tagAndBody(contact.id, CRM_COMMAND_TAGS.confirm);

    const started = Date.now();
    const response = await post(body);
    expect(Date.now() - started).toBeLessThan(10_000);

    expect(response.status).toBe(200);
    expect(await statusOf(appointmentId)).toBe("CONFIRMED");
    const dispatches = await dispatchesOf(practiceId, appointmentId);
    expect(dispatches.map((row) => [row.cadenceStep?.action, row.status])).toEqual([
      ["REMINDER", "SCHEDULED"],
      ["REQUEST_CONFIRMATION", "SENT"],
      ["REQUEST_CONFIRMATION", "CANCELED"],
    ]);

    const change = await fixture.db.appointmentStatusChange.findFirstOrThrow({ where: { appointmentId, toStatus: "CONFIRMED" } });
    expect(change.source).toBe("CRM");
    expect(change.changedByUserId).toBeNull();
    const audit = await fixture.db.auditEvent.findFirstOrThrow({ where: { entityId: appointmentId, action: "appointment.status_changed" } });
    expect(audit.actorType).toBe("CRM");

    // The command is gone from the contact, and the next export shows the new status.
    const after = (await crmContactOf(practiceId, contact.phone!))!;
    expect(after.tagNames).not.toContain(CRM_COMMAND_TAGS.confirm);
    await exportToCrm(practiceId);
    expect((await crmContactOf(practiceId, contact.phone!))!.tagNames).toContain("Agenda: Confirmado");
  });

  it("refuses a request without the secret of the URL, and changes nothing", async () => {
    const { appointmentId, contact } = await bookWithSentRequest();
    const body = await tagAndBody(contact.id, CRM_COMMAND_TAGS.confirm);
    expect((await post(body, "wrong-secret")).status).toBe(401);
    expect((await post(body, "")).status).toBe(401);
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
    expect((await crmContactOf(practiceId, contact.phone!))!.tagNames).toContain(CRM_COMMAND_TAGS.confirm);
  });

  it("refuses an event of another FlwChat account", async () => {
    const { appointmentId, contact } = await bookWithSentRequest();
    const body = await tagAndBody(contact.id, CRM_COMMAND_TAGS.confirm);
    const forged = { ...body, content: { ...body.content, companyId: "another-company" } };
    expect((await post(forged)).status).toBe(401);
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
  });

  it("does not believe the body: without the tag in the CRM, nothing happens", async () => {
    const { appointmentId, contact } = await bookWithSentRequest();
    const forged = { ...(await sandboxWebhookBody(practiceId, contact.id)), content: { id: contact.id, companyId: `sandbox-${practiceId}`, tags: [CRM_COMMAND_TAGS.confirm] } };
    expect((await post(forged)).status).toBe(200);
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
  });

  it("answers 400 for a body that is not an object", async () => {
    expect((await post([1, 2])).status).toBe(400);
  });

  it("applies a repeated event only once", async () => {
    const { appointmentId, contact } = await bookWithSentRequest();
    const body = await tagAndBody(contact.id, CRM_COMMAND_TAGS.confirm);

    expect((await post(body)).status).toBe(200);
    const second = await post(body);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ duplicate: true });

    expect(await fixture.db.appointmentStatusChange.count({ where: { appointmentId, toStatus: "CONFIRMED" } })).toBe(1);
    expect(await fixture.db.crmInboundEvent.count({ where: { appointmentId } })).toBe(1);
  });

  it("does not repeat the manual contact when the same event comes again", async () => {
    const { appointmentId, contact } = await bookWithSentRequest();
    const body = await tagAndBody(contact.id, CRM_COMMAND_TAGS.manual_contact);
    await post(body);
    await post(body);
    expect(await fixture.db.appointmentFlag.count({ where: { appointmentId, type: "MANUAL_CONTACT" } })).toBe(1);
  });

  it("takes a new command after the first, on a later event", async () => {
    const { appointmentId, contact } = await bookWithSentRequest();
    await post(await tagAndBody(contact.id, CRM_COMMAND_TAGS.manual_contact));
    const later = await tagAndBody(contact.id, CRM_COMMAND_TAGS.confirm);
    await post({ ...later, date: new Date(Date.now() + 60_000).toISOString() });
    expect(await statusOf(appointmentId)).toBe("CONFIRMED");
  });

  it("leaves the patient's messages to the WhatsAPI webhook (D-05)", async () => {
    const { patient, appointmentId, contact } = await bookWithSentRequest();
    const response = await post({
      eventType: "MESSAGE_RECEIVED",
      date: new Date().toISOString(),
      content: { id: "m1", companyId: `sandbox-${practiceId}`, text: "1", contactId: contact.id, phonenumber: patient.phone },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ignored: true });
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
    expect(await fixture.db.crmInboundEvent.count({ where: { patientId: patient.id } })).toBe(0);
  });

  it("does not call the CRM back for a tag event with no command, as its own tags cause", async () => {
    const { contact } = await bookWithSentRequest();
    const spy = failingCrm(practiceId, "transient", ["getContact"]);
    override.provider = spy;
    const response = await post(await sandboxWebhookBody(practiceId, contact.id));
    expect(response.status).toBe(200);
    expect(spy.attempts).toBe(0);
  });

  it("with the CRM down, answers 200, asks for a new check, and the check applies it", async () => {
    const { appointmentId, contact } = await bookWithSentRequest();
    const body = await tagAndBody(contact.id, CRM_COMMAND_TAGS.confirm);
    override.provider = failingCrm(practiceId, "transient", ["getContact"]);

    const response = await post(body);

    expect(response.status).toBe(200);
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: CRM_CONTACT_CHECK_EVENT, data: { accountId, contactId: contact.id } }));

    // The same delivery is not taken for a repeat: nothing was recorded.
    override.provider = undefined;
    await post(body);
    expect(await statusOf(appointmentId)).toBe("CONFIRMED");
  });

  it("a command that fails to come off the contact is not applied twice", async () => {
    const { appointmentId, contact } = await bookWithSentRequest();
    const body = await tagAndBody(contact.id, CRM_COMMAND_TAGS.confirm);
    override.provider = failingCrm(practiceId, "transient", ["updateTags"]);
    expect((await post(body)).status).toBe(200);
    expect(await statusOf(appointmentId)).toBe("CONFIRMED");

    override.provider = undefined;
    await post({ ...body, date: new Date(Date.now() + 60_000).toISOString() });
    expect(await fixture.db.appointmentStatusChange.count({ where: { appointmentId, toStatus: "CONFIRMED" } })).toBe(1);
    expect((await crmContactOf(practiceId, contact.phone!))!.tagNames).not.toContain(CRM_COMMAND_TAGS.confirm);
  });

  it("an appointment already closed does not change, and the secretary is told", async () => {
    const { appointmentId, contact } = await bookWithSentRequest();
    await changeAppointmentStatus(secretary, { appointmentId, to: "CANCELED_BY_PRACTICE" });
    await post(await tagAndBody(contact.id, CRM_COMMAND_TAGS.confirm));
    expect(await statusOf(appointmentId)).toBe("CANCELED_BY_PRACTICE");
    const after = (await crmContactOf(practiceId, contact.phone!))!;
    expect(after.tagNames).not.toContain(CRM_COMMAND_TAGS.confirm);
    expect(after.notes.at(-1)!.text).toContain(CRM_COMMAND_TAGS.confirm);
  });

  it("a revoked connection answers 200 and does nothing", async () => {
    const other = await createAgendaFixture("Consultório CRM revogado webhook");
    const { secret: otherSecret } = await connectCrm(other.practiceId, { status: "REVOKED" });
    const response = await post({ eventType: "CONTACT_TAG_UPDATE", date: "x", content: { id: "c", companyId: `sandbox-${other.practiceId}`, tags: [CRM_COMMAND_TAGS.confirm] } }, otherSecret);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ignored: true });
  });

  it("the secret of one practice never reaches another's appointment (isolation)", async () => {
    const other = await createAgendaFixture("Consultório CRM vizinho");
    await openWindowAllDay(other.practiceId);
    await addInstance(other.practiceId, other.professionals.ana.id);
    const { secret: otherSecret } = await connectCrm(other.practiceId);
    const otherSecretary = await contextAs(other, "SECRETARY");
    const cadence = await createCadence(other.practiceId, "Vizinha", [{ anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", action: "REQUEST_CONFIRMATION" }]);
    const otherType = await createTypeWithCadence(other.practiceId, "Consulta vizinha", cadence.id);

    // The same phone is a patient in both practices.
    const { patient, appointmentId, contact } = await bookWithSentRequest();
    const neighbor = await createPatient(other.practiceId, { phone: patient.phone! });
    const { id: neighborAppointment } = await createAppointment(otherSecretary, {
      patientId: neighbor.id,
      professionalId: other.professionals.ana.id,
      locationId: other.locations.aldeota.id,
      appointmentTypeId: otherType.id,
      date: dayAhead(nextDay++),
      time: "10:00",
    });
    const request = (await dispatchesOf(other.practiceId, neighborAppointment))[0];
    await other.db.dispatch.update({ where: { id: request.id }, data: { status: "SENT", sentAt: new Date() } });

    const neighborContact = await putSandboxContact(other.practiceId, { name: "Vizinha", phone: patient.phone! });
    await applySandboxTag(other.practiceId, neighborContact.id, CRM_COMMAND_TAGS.confirm);
    await post(await sandboxWebhookBody(other.practiceId, neighborContact.id), otherSecret);

    expect((await other.db.appointment.findUniqueOrThrow({ where: { id: neighborAppointment } })).status).toBe("CONFIRMED");
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
    expect((await crmContactOf(practiceId, contact.phone!))!.id).toBe(contact.id);

    // A contact of this practice's account, sent to the other practice's URL, finds nothing.
    await applySandboxTag(practiceId, contact.id, CRM_COMMAND_TAGS.confirm);
    const crossed = await sandboxWebhookBody(practiceId, contact.id);
    expect((await post(crossed, otherSecret)).status).toBe(401);
    expect(await statusOf(appointmentId)).toBe("SCHEDULED");
  });
});
