import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { connectCrm } from "../../../tests/helpers/crm";
import { createAgendaFixture } from "../../../tests/helpers/practice";
import { practicesToSyncCrm, practicesWithCrm } from "./jobs";

// What the minute tick and the daily reconciliation find across practices (D-68, D-69).

afterAll(async () => {
  await prisma.$disconnect();
});

describe("practicesToSyncCrm", () => {
  it("finds a practice with something due, and only on an active connection", async () => {
    const quiet = await createAgendaFixture("Consultório Tick Quieto");
    await connectCrm(quiet.practiceId);
    const due = await createAgendaFixture("Consultório Tick Paciente");
    await connectCrm(due.practiceId);
    await due.db.patient.update({ where: { id: due.patient.id }, data: { crmSyncRequestedAt: new Date() } });
    const revoked = await createAgendaFixture("Consultório Tick Revogado");
    await connectCrm(revoked.practiceId, { status: "REVOKED" });
    await revoked.db.patient.update({ where: { id: revoked.patient.id }, data: { crmSyncRequestedAt: new Date() } });
    const none = await createAgendaFixture("Consultório Tick Sem Conexão");
    await none.db.patient.update({ where: { id: none.patient.id }, data: { crmSyncRequestedAt: new Date() } });

    const rows = await practicesToSyncCrm();
    const practices = rows.map((row) => row.practiceId);

    expect(rows.find((row) => row.practiceId === due.practiceId)?.accountId).toBeTruthy();
    expect(practices).toContain(due.practiceId);
    expect(practices).not.toContain(quiet.practiceId);
    expect(practices).not.toContain(revoked.practiceId);
    expect(practices).not.toContain(none.practiceId);
  });

  it("waits for the time of a new attempt, and takes a pending erasure", async () => {
    const waiting = await createAgendaFixture("Consultório Tick Espera");
    await connectCrm(waiting.practiceId);
    const now = new Date();
    await waiting.db.patient.update({ where: { id: waiting.patient.id }, data: { crmSyncRequestedAt: now, crmSyncRetryAt: new Date(now.getTime() + 60_000) } });
    const dueAt = async (at: Date) => (await practicesToSyncCrm(at)).map((row) => row.practiceId);
    expect(await dueAt(now)).not.toContain(waiting.practiceId);
    expect(await dueAt(new Date(now.getTime() + 61_000))).toContain(waiting.practiceId);

    const erasing = await createAgendaFixture("Consultório Tick Exclusão");
    await connectCrm(erasing.practiceId);
    await erasing.db.patient.update({ where: { id: erasing.patient.id }, data: { crmEraseRequestedAt: now } });
    expect(await dueAt(now)).toContain(erasing.practiceId);
  });
});

describe("practicesWithCrm", () => {
  it("lists the active connections", async () => {
    const active = await createAgendaFixture("Consultório Diário");
    await connectCrm(active.practiceId);
    const revoked = await createAgendaFixture("Consultório Diário Revogado");
    await connectCrm(revoked.practiceId, { status: "REVOKED" });
    const practices = (await practicesWithCrm()).map((row) => row.practiceId);
    expect(practices).toContain(active.practiceId);
    expect(practices).not.toContain(revoked.practiceId);
  });
});
