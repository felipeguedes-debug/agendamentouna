import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAppointment } from "@/lib/appointments/appointments";
import { forPractice, prisma } from "@/lib/db";
import {
  addInstance,
  createCadence,
  createPatient,
  createTypeWithCadence,
  dayAhead,
  dispatchesOf,
  openWindowAllDay,
  TEST_INSTANCE_TOKEN,
} from "../../../../../../tests/helpers/cadence";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../../../../tests/helpers/practice";
import { POST } from "./route";

// The WhatsAPI webhook (D-05). Block 5 done criterion: in the test environment, a
// webhook with the answer "1" turns the appointment Confirmado within 10 s and ends
// the confirmation requests.

let fixture: AgendaFixture;
let db: ReturnType<typeof forPractice>;
let instanceId: string;
let typeId: string;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Webhook");
  db = forPractice(fixture.practiceId);
  await openWindowAllDay(fixture.practiceId);
  instanceId = (await addInstance(fixture.practiceId, fixture.professionals.ana.id)).id;
  const cadence = await createCadence(fixture.practiceId, "Webhook", [
    { anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", action: "REQUEST_CONFIRMATION" },
    { anchor: "APPOINTMENT", offsetMinutes: -180, action: "REQUEST_CONFIRMATION" },
    { anchor: "APPOINTMENT", offsetMinutes: -2880, eligibleStatuses: ["SCHEDULED", "CONFIRMED"], action: "REMINDER" },
  ]);
  typeId = (await createTypeWithCadence(fixture.practiceId, "Consulta webhook", cadence.id)).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function post(id: string, body: unknown) {
  const request = new Request(`http://localhost/api/webhooks/whatsapi/${id}`, { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
  return POST(request, { params: Promise.resolve({ instanceId: id }) });
}

const envelope = (eventType: string, fields: Record<string, unknown>, token = TEST_INSTANCE_TOKEN) => ({
  EventType: eventType,
  owner: "5585900000099",
  token,
  BaseUrl: "https://free.uazapi.test",
  instanceName: "Dra. Ana",
  ...fields,
});

let nextDay = 10;

async function bookWithSentRequest() {
  const patient = await createPatient(fixture.practiceId);
  const secretary = await contextAs(fixture, "SECRETARY");
  const { id } = await createAppointment(secretary, {
    patientId: patient.id,
    professionalId: fixture.professionals.ana.id,
    locationId: fixture.locations.aldeota.id,
    appointmentTypeId: typeId,
    date: dayAhead(nextDay++),
    time: "10:00",
  });
  const request = (await dispatchesOf(fixture.practiceId, id)).find((row) => row.cadenceStep?.offsetMinutes === -1440)!;
  await db.dispatch.update({ where: { id: request.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: `3EB0${request.id.slice(0, 8)}` } });
  return { patient, appointmentId: id, request };
}

describe("POST /api/webhooks/whatsapi/[instanceId]", () => {
  it("confirms on a reply 1 within 10 s and ends the confirmation requests (done criterion)", async () => {
    const { patient, appointmentId } = await bookWithSentRequest();
    const started = Date.now();
    const response = await post(
      instanceId,
      envelope("messages", {
        message: {
          id: "5585900000099:MSG1",
          messageid: "MSG1",
          chatid: `${patient.phone!.slice(1)}@s.whatsapp.net`,
          sender: `${patient.phone!.slice(1)}@s.whatsapp.net`,
          fromMe: false,
          isGroup: false,
          messageType: "Conversation",
          text: "1",
          messageTimestamp: Date.now(),
        },
      }),
    );
    const elapsed = Date.now() - started;

    expect(response.status).toBe(200);
    expect(elapsed).toBeLessThan(10_000);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe("CONFIRMED");
    const dispatches = await dispatchesOf(fixture.practiceId, appointmentId);
    expect(dispatches.map((row) => [row.cadenceStep?.action, row.status])).toEqual([
      ["REMINDER", "SCHEDULED"],
      ["REQUEST_CONFIRMATION", "READ"],
      ["REQUEST_CONFIRMATION", "CANCELED"],
    ]);
  });

  it("refuses a request without the instance token", async () => {
    const { patient, appointmentId } = await bookWithSentRequest();
    const body = envelope("messages", { message: { chatid: `${patient.phone!.slice(1)}@s.whatsapp.net`, fromMe: false, isGroup: false, text: "1" } }, "wrong-token");
    expect((await post(instanceId, body)).status).toBe(401);
    expect((await post(instanceId, { ...body, token: undefined })).status).toBe(401);
    expect((await db.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).status).toBe("SCHEDULED");
  });

  it("answers 404 for an unknown instance and 400 for a body that is not an object", async () => {
    expect((await post("6f1d1c8e-1c1b-4c3b-9d9e-000000000000", envelope("messages", {}))).status).toBe(404);
    expect((await post("not-a-uuid", envelope("messages", {}))).status).toBe(404);
    expect((await post(instanceId, [1, 2])).status).toBe(400);
  });

  it("records delivery and reading, never going backwards", async () => {
    const { appointmentId, request } = await bookWithSentRequest();
    const receipt = (state: string) =>
      post(instanceId, envelope("messages_update", { type: "ReadReceipt", state, event: { Chat: "x", MessageIDs: [`3EB0${request.id.slice(0, 8)}`], Type: state, IsFromMe: true, IsGroup: false } }));
    const statusOf = async () => (await dispatchesOf(fixture.practiceId, appointmentId)).find((row) => row.id === request.id)!.status;

    await receipt("Delivered");
    expect(await statusOf()).toBe("DELIVERED");
    await receipt("Read");
    expect(await statusOf()).toBe("READ");
    await receipt("Delivered");
    expect(await statusOf()).toBe("READ");
  });

  it("records the instance's connection", async () => {
    const other = await addInstance(fixture.practiceId, fixture.professionals.bruno.id);
    await post(other.id, envelope("connection", { event_id: "e1", type: "Disconnected", instance: { name: "Dr. Bruno", status: "disconnected" } }));
    expect((await db.whatsappInstance.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("DISCONNECTED");
    await post(other.id, envelope("connection", { event_id: "e2", instance: { name: "Dr. Bruno", status: "connected" } }));
    expect((await db.whatsappInstance.findUniqueOrThrow({ where: { id: other.id } })).status).toBe("CONNECTED");
  });
});
