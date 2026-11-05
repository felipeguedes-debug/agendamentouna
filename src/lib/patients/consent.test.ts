import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { consentHistory, currentConsent, recordConsent } from "./consent";

// Contact consent (PRD 6 rule 1, PRD 7 LGPD; D-19, D-47): an append-only log with
// date and channel; the latest row is the current state. Manual revocation here;
// the PARAR reply is Block 5.

let fixture: AgendaFixture;
let other: AgendaFixture;
let secretary: PracticeContext;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Consentimento");
  other = await createAgendaFixture("Consultório Consentimento Outro");
  secretary = await contextAs(fixture, "SECRETARY");
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function newPatient(name: string, phone: string) {
  return fixture.db.patient.create({ data: { practiceId: fixture.practiceId, name, phone } });
}

describe("recordConsent", () => {
  it("records consent and its revocation as new rows, with channel, author and audit", async () => {
    const patient = await newPatient("Ana Consente", "+5585991110001");
    expect(await currentConsent(secretary, patient.id)).toBe("unknown");

    await recordConsent(secretary, { patientId: patient.id, granted: true, channel: "PHONE" });
    expect(await currentConsent(secretary, patient.id)).toBe("granted");
    await recordConsent(secretary, { patientId: patient.id, granted: false, channel: "WHATSAPP" });
    expect(await currentConsent(secretary, patient.id)).toBe("refused");

    const history = await consentHistory(secretary, patient.id);
    expect(history.map((row) => [row.granted, row.channel, row.recordedByName])).toEqual([
      [false, "WHATSAPP", secretary.user.name],
      [true, "PHONE", secretary.user.name],
    ]);
    const audit = await fixture.db.auditEvent.findMany({ where: { action: "contact_consent.recorded", actorUserId: secretary.user.id } });
    expect(audit).toHaveLength(2);
    expect(audit.every((event) => event.entityType === "ContactConsent" && event.changedFields.join() === "granted,channel")).toBe(true);
  });

  it("records a refusal when nothing was recorded before", async () => {
    const patient = await newPatient("Bia Recusa", "+5585991110002");
    await recordConsent(secretary, { patientId: patient.id, granted: false, channel: "IN_PERSON" });
    expect(await currentConsent(secretary, patient.id)).toBe("refused");
  });

  it("refuses a row that would not change the state, such as a double click", async () => {
    const patient = await newPatient("Caio Repete", "+5585991110003");
    await recordConsent(secretary, { patientId: patient.id, granted: true, channel: "FORM" });
    await expect(recordConsent(secretary, { patientId: patient.id, granted: true, channel: "PHONE" })).rejects.toMatchObject({ code: "consent_unchanged" });
    expect(await consentHistory(secretary, patient.id)).toHaveLength(1);
  });

  it("takes only the manual channels; Importação belongs to the import", async () => {
    const patient = await newPatient("Davi Canal", "+5585991110004");
    for (const channel of ["IMPORT", "SMS"]) {
      await expect(recordConsent(secretary, { patientId: patient.id, granted: true, channel: channel as "PHONE" })).rejects.toMatchObject({ code: "invalid_channel" });
    }
  });

  it("is open to the office and refused to the professional", async () => {
    const patient = await newPatient("Eva Papéis", "+5585991110005");
    const professional = await contextAs(fixture, "PROFESSIONAL", { professionalId: fixture.professionals.bruno.id });
    await expect(recordConsent(professional, { patientId: patient.id, granted: true, channel: "PHONE" })).rejects.toMatchObject({ code: "not_allowed" });
    const manager = await contextAs(fixture, "PRACTICE_MANAGER");
    await recordConsent(manager, { patientId: patient.id, granted: true, channel: "PHONE" });
  });

  it("does not reach another practice's patient nor an anonymized one", async () => {
    await expect(recordConsent(secretary, { patientId: other.patient.id, granted: true, channel: "PHONE" })).rejects.toMatchObject({ code: "patient_unavailable" });
    const erased = await fixture.db.patient.create({ data: { practiceId: fixture.practiceId, name: "Paciente excluído", anonymizedAt: new Date() } });
    await expect(recordConsent(secretary, { patientId: erased.id, granted: true, channel: "PHONE" })).rejects.toMatchObject({ code: "patient_unavailable" });
    await expect(recordConsent(secretary, { patientId: "not-a-uuid", granted: true, channel: "PHONE" })).rejects.toMatchObject({ code: "patient_unavailable" });
  });
});
