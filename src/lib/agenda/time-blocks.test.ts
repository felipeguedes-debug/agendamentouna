import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { exportAppointments } from "@/lib/google/outbound";
import { sandboxEvent } from "@/lib/google/sandbox";
import { eventIdFor } from "@/lib/google/rules";
import { inngest } from "@/lib/inngest/client";
import { failingProvider, linkGoogle } from "../../../tests/helpers/google";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { AgendaError } from "./errors";
import { blockConflicts, createTimeBlock, getManualBlock, removeTimeBlock, updateTimeBlock } from "./time-blocks";

// Manual blocks (PRD 4, rule 2; D-85): who creates them, what they ask for, what they
// warn about, and the event that says only "Bloqueado" in Google.

const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);

let fixture: AgendaFixture;
let secretary: PracticeContext;
let anaProfessional: PracticeContext;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Bloqueios");
  secretary = await contextAs(fixture, "SECRETARY");
  anaProfessional = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.ana.id });
});

beforeEach(() => send.mockClear());

afterAll(async () => {
  await prisma.$disconnect();
});

const input = (extra: Partial<Parameters<typeof createTimeBlock>[1]> = {}) => ({
  professionalId: fixture.professionals.ana.id,
  date: "2030-03-11",
  startTime: "09:00",
  endTime: "10:00",
  allDay: false,
  reason: "Reunião da clínica",
  ...extra,
});

async function code(promise: Promise<unknown>) {
  try {
    await promise;
    return "ok";
  } catch (error) {
    if (error instanceof AgendaError) return error.code;
    throw error;
  }
}

describe("createTimeBlock", () => {
  it("creates the block in the agenda's time zone and audits only field names", async () => {
    const { id } = await createTimeBlock(secretary, input());
    const block = await fixture.db.timeBlock.findUniqueOrThrow({ where: { id } });
    expect(block.startsAt).toEqual(new Date("2030-03-11T12:00:00Z"));
    expect(block.endsAt).toEqual(new Date("2030-03-11T13:00:00Z"));
    expect(block.source).toBe("MANUAL");
    expect(block.reason).toBe("Reunião da clínica");
    expect(block.createdByUserId).toBe(secretary.user.id);
    const audit = await fixture.db.auditEvent.findFirstOrThrow({ where: { action: "time_block.created", entityId: id } });
    expect(audit.changedFields).toEqual(["startsAt", "endsAt", "reason"]);
    expect(JSON.stringify(audit)).not.toContain("Reunião");
  });

  it("covers the whole day when asked", async () => {
    const { id } = await createTimeBlock(secretary, input({ date: "2030-03-12", startTime: "", endTime: "", allDay: true }));
    const block = await fixture.db.timeBlock.findUniqueOrThrow({ where: { id } });
    expect(block.allDay).toBe(true);
    expect(block.startsAt).toEqual(new Date("2030-03-12T03:00:00Z"));
    expect(block.endsAt).toEqual(new Date("2030-03-13T03:00:00Z"));
  });

  it("asks for the reason and for a period that makes sense", async () => {
    expect(await code(createTimeBlock(secretary, input({ reason: "  " })))).toBe("block_reason_required");
    expect(await code(createTimeBlock(secretary, input({ startTime: "10:00", endTime: "09:00" })))).toBe("invalid_block_time");
    expect(await code(createTimeBlock(secretary, input({ date: "ontem" })))).toBe("invalid_date");
  });

  it("lets the professional block only the own agenda", async () => {
    expect(await code(createTimeBlock(anaProfessional, input({ date: "2030-03-13" })))).toBe("ok");
    expect(await code(createTimeBlock(anaProfessional, input({ date: "2030-03-13", professionalId: fixture.professionals.bruno.id })))).toBe("not_allowed");
  });

  it("refuses a professional of another practice", async () => {
    const other = await createAgendaFixture("Outro consultório de bloqueios");
    expect(await code(createTimeBlock(secretary, input({ professionalId: other.professionals.ana.id })))).toBe("professional_unavailable");
  });
});

describe("blockConflicts", () => {
  it("lists the appointments in the period, without cancelling them", async () => {
    const appointment = await fixture.db.appointment.create({
      data: {
        practiceId: fixture.practiceId,
        patientId: fixture.patient.id,
        professionalId: fixture.professionals.ana.id,
        locationId: fixture.locations.aldeota.id,
        appointmentTypeId: fixture.types.consultation.id,
        startsAt: new Date("2030-03-14T17:00:00Z"),
        endsAt: new Date("2030-03-14T17:30:00Z"),
        durationMinutes: 30,
        priceCents: 45000,
      },
    });
    const period = input({ date: "2030-03-14", startTime: "11:00", endTime: "15:00" });
    expect(await blockConflicts(secretary, period)).toEqual([{ id: appointment.id, patientName: "Maria Souza", date: "2030-03-14", time: "14:00" }]);
    await createTimeBlock(secretary, period);
    expect((await fixture.db.appointment.findUniqueOrThrow({ where: { id: appointment.id } })).status).toBe("SCHEDULED");
    expect(await blockConflicts(secretary, input({ date: "2030-03-14", startTime: "08:00", endTime: "09:00" }))).toEqual([]);
  });
});

describe("editing and removing", () => {
  it("edits a manual block and audits the change", async () => {
    const { id } = await createTimeBlock(secretary, input({ date: "2030-03-15" }));
    await updateTimeBlock(secretary, id, input({ date: "2030-03-15", startTime: "14:00", endTime: "15:00", reason: "Congresso" }));
    const block = await getManualBlock(secretary, id);
    expect(block).toMatchObject({ date: "2030-03-15", startTime: "14:00", endTime: "15:00", reason: "Congresso", createdByName: secretary.user.name });
    expect(await fixture.db.auditEvent.count({ where: { action: "time_block.updated", entityId: id } })).toBe(1);
  });

  it("does not touch a block that came from Google", async () => {
    const block = await fixture.db.timeBlock.create({
      data: { practiceId: fixture.practiceId, professionalId: fixture.professionals.ana.id, startsAt: new Date("2030-04-01T12:00:00Z"), endsAt: new Date("2030-04-01T13:00:00Z"), source: "GOOGLE", googleCalendarId: "c", googleEventId: "e-block" },
    });
    expect(await getManualBlock(secretary, block.id)).toBeNull();
    expect(await code(updateTimeBlock(secretary, block.id, input()))).toBe("block_not_found");
    expect(await code(removeTimeBlock(secretary, block.id))).toBe("block_not_found");
  });

  it("does not let the professional touch another one's block", async () => {
    const { id } = await createTimeBlock(secretary, input({ date: "2030-03-18", professionalId: fixture.professionals.bruno.id }));
    expect(await getManualBlock(anaProfessional, id)).toBeNull();
    expect(await code(removeTimeBlock(anaProfessional, id))).toBe("block_not_found");
  });

  it("removes a block with no event in Google at once", async () => {
    const { id } = await createTimeBlock(secretary, input({ date: "2030-03-19" }));
    await removeTimeBlock(secretary, id);
    expect(await fixture.db.timeBlock.findUnique({ where: { id } })).toBeNull();
    expect(await fixture.db.auditEvent.count({ where: { action: "time_block.removed", entityId: id } })).toBe(1);
  });
});

describe("the block in Google (D-85)", () => {
  async function linkedFixture() {
    const linked = await createAgendaFixture("Consultório Bloqueio no Google");
    const google = await linkGoogle(linked.practiceId, linked.professionals.ana.id);
    return { linked, google, context: await contextAs(linked, "SECRETARY") };
  }

  it("marks the block, asks for the export and writes only 'Bloqueado'", async () => {
    const { linked, google, context } = await linkedFixture();
    const { id } = await createTimeBlock(context, { ...input({ professionalId: linked.professionals.ana.id }), reason: "Exame pessoal" });
    expect((await linked.db.timeBlock.findUniqueOrThrow({ where: { id } })).googleSyncRequestedAt).not.toBeNull();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ data: { practiceId: linked.practiceId, appointmentIds: [] } }));

    await exportAppointments(linked.practiceId);
    const block = await linked.db.timeBlock.findUniqueOrThrow({ where: { id } });
    expect(block).toMatchObject({ googleSyncRequestedAt: null, googleEventId: eventIdFor(id), googleCalendarId: google.secondaryCalendarId });
    const event = await sandboxEvent(google.secondaryCalendarId!, eventIdFor(id));
    expect(event?.summary).toBe("Bloqueado");
    expect(JSON.stringify(event)).not.toContain("Exame");
  });

  it("moves the event with the block and deletes it before the row goes", async () => {
    const { linked, google, context } = await linkedFixture();
    const professionalId = linked.professionals.ana.id;
    const { id } = await createTimeBlock(context, input({ professionalId }));
    await exportAppointments(linked.practiceId);

    await updateTimeBlock(context, id, input({ professionalId, startTime: "15:00", endTime: "16:00" }));
    await exportAppointments(linked.practiceId);
    expect((await sandboxEvent(google.secondaryCalendarId!, eventIdFor(id)))?.startsAt).toEqual(new Date("2030-03-11T18:00:00Z"));

    await removeTimeBlock(context, id);
    const removed = await linked.db.timeBlock.findUniqueOrThrow({ where: { id } });
    expect(removed.deletedAt).not.toBeNull();
    expect(await blockConflicts(context, input({ professionalId, startTime: "15:00", endTime: "16:00" }))).toEqual([]);
    await exportAppointments(linked.practiceId);
    expect(await linked.db.timeBlock.findUnique({ where: { id } })).toBeNull();
    expect((await sandboxEvent(google.secondaryCalendarId!, eventIdFor(id)))?.status ?? "cancelled").toBe("cancelled");
  });

  it("does not stop the agenda when Google fails", async () => {
    const { linked, context } = await linkedFixture();
    const { id } = await createTimeBlock(context, input({ professionalId: linked.professionals.ana.id }));
    await exportAppointments(linked.practiceId, { provider: failingProvider("transient", ["insertEvent"]) });
    expect(await linked.db.timeBlock.findUniqueOrThrow({ where: { id } })).toMatchObject({ googleSyncAttempts: 1, googleEventId: null });
    expect((await linked.db.timeBlock.findUniqueOrThrow({ where: { id } })).googleSyncRequestedAt).not.toBeNull();
  });
});
