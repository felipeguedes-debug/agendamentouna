import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forPractice, prisma } from "@/lib/db";
import { addInstance } from "../../../tests/helpers/cadence";
import { createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { instancesWithDueDispatches } from "./queue";

// The minute tick finds which instances have dispatches due (src/lib/inngest).

let fixture: AgendaFixture;
let db: ReturnType<typeof forPractice>;
let anaInstance: string;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Fila");
  db = forPractice(fixture.practiceId);
  anaInstance = (await addInstance(fixture.practiceId, fixture.professionals.ana.id)).id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function dueDispatch(professionalId: string, whatsappInstanceId: string | null, minutesAgo: number) {
  const startsAt = new Date(Date.now() + 3 * 86_400_000 + Math.random() * 3_600_000);
  const appointment = await db.appointment.create({
    data: {
      practiceId: fixture.practiceId,
      locationId: fixture.locations.aldeota.id,
      professionalId,
      patientId: fixture.patient.id,
      appointmentTypeId: fixture.types.consultation.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      durationMinutes: 30,
      priceCents: 0,
    },
  });
  return db.dispatch.create({
    data: { practiceId: fixture.practiceId, appointmentId: appointment.id, whatsappInstanceId, scheduledFor: new Date(Date.now() - minutesAgo * 60_000) },
  });
}

describe("instancesWithDueDispatches", () => {
  it("lists each instance with due dispatches once, with its practice", async () => {
    await dueDispatch(fixture.professionals.ana.id, anaInstance, 2);
    await dueDispatch(fixture.professionals.ana.id, anaInstance, 1);
    const due = await instancesWithDueDispatches();
    expect(due.filter((row) => row.instanceId === anaInstance)).toEqual([{ practiceId: fixture.practiceId, instanceId: anaInstance }]);
  });

  it("gives a dispatch planned without instance the professional's current one, or fails it", async () => {
    const withInstance = await dueDispatch(fixture.professionals.ana.id, null, 1);
    const withoutInstance = await dueDispatch(fixture.professionals.bruno.id, null, 1);
    await instancesWithDueDispatches();
    expect(await db.dispatch.findUniqueOrThrow({ where: { id: withInstance.id } })).toMatchObject({ status: "SCHEDULED", whatsappInstanceId: anaInstance });
    expect(await db.dispatch.findUniqueOrThrow({ where: { id: withoutInstance.id } })).toMatchObject({ status: "FAILED", statusReason: "no_instance" });
  });
});
