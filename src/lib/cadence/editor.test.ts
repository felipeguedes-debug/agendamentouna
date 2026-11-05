import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { createAppointment } from "@/lib/appointments/appointments";
import { forPractice, prisma } from "@/lib/db";
import { addInstance, createPatient, dispatchesOf, openWindowAllDay } from "../../../tests/helpers/cadence";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { cadencePreview, createCadence, getCadenceEditor, listChannels, saveCadence, saveSendWindow, type CadenceInput } from "./editor";

// The cadence editor (PRD 6; D-06, D-07, D-14; rules 6 and 7): name, types and
// professionals it applies to, 1 to 4 steps, the practice's send window, a new
// version when the steps change, and the preview for next Tuesday at 10h.

let fixture: AgendaFixture;
let manager: PracticeContext;
let secretary: PracticeContext;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Editor de Régua");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
  secretary = await contextAs(fixture, "SECRETARY");
});

afterAll(async () => {
  await prisma.$disconnect();
});

const STEPS: CadenceInput["steps"] = [
  { when: "booking", amount: 0, time: "", statuses: "scheduled", action: "REMINDER", template: "Olá, {primeiro_nome}! {tipo} marcado para {data_extenso} às {hora}." },
  { when: "days", amount: 1, time: "18:00", statuses: "scheduled", action: "REQUEST_CONFIRMATION", template: "{primeiro_nome}, confirma amanhã às {hora}? Responda 1, 2 ou 3." },
  { when: "hours", amount: 3, time: "", statuses: "scheduled", action: "REQUEST_CONFIRMATION", template: "Ainda sem confirmação para hoje às {hora}." },
];

function input(overrides: Partial<CadenceInput> = {}): CadenceInput {
  return { name: "Consulta padrão", active: true, typeIds: [], professionalIds: [], steps: STEPS, ...overrides };
}

describe("createCadence and saveCadence", () => {
  it("creates a cadence with one step and saves name, steps, types and professionals", async () => {
    const id = await createCadence(manager, "Nova régua");
    const created = await getCadenceEditor(manager, id);
    expect(created).toMatchObject({ name: "Nova régua", version: 1, active: true });
    expect(created!.steps).toHaveLength(1);

    await saveCadence(manager, id, input({ typeIds: [fixture.types.procedure.id], professionalIds: [fixture.professionals.ana.id] }));
    const saved = await getCadenceEditor(manager, id);
    expect(saved).toMatchObject({ name: "Consulta padrão", version: 2, typeIds: [fixture.types.procedure.id], professionalIds: [fixture.professionals.ana.id] });
    expect(saved!.steps).toEqual(STEPS);
    expect(await forPractice(fixture.practiceId).auditEvent.count({ where: { entityId: id, action: "cadence.updated" } })).toBe(1);
  });

  it("keeps the version when only the name, types or professionals change", async () => {
    const id = await createCadence(manager, "Sem passos novos");
    await saveCadence(manager, id, input({ name: "Exame" }));
    const before = (await getCadenceEditor(manager, id))!.version;
    await saveCadence(manager, id, input({ name: "Exame de imagem", professionalIds: [fixture.professionals.bruno.id] }));
    expect((await getCadenceEditor(manager, id))!.version).toBe(before);
  });

  it("moves a type from its old cadence to this one", async () => {
    const first = await createCadence(manager, "Primeira");
    const second = await createCadence(manager, "Segunda");
    await saveCadence(manager, first, input({ name: "Primeira", typeIds: [fixture.types.procedure.id] }));
    await saveCadence(manager, second, input({ name: "Segunda", typeIds: [fixture.types.procedure.id] }));
    expect((await getCadenceEditor(manager, first))!.typeIds).toEqual([]);
    expect((await getCadenceEditor(manager, second))!.typeIds).toEqual([fixture.types.procedure.id]);
  });

  it("validates the steps", async () => {
    const id = await createCadence(manager, "Validação");
    const save = (steps: CadenceInput["steps"]) => saveCadence(manager, id, input({ steps }));
    await expect(save([])).rejects.toMatchObject({ code: "invalid_steps" });
    await expect(save([...STEPS, STEPS[0], STEPS[1]])).rejects.toMatchObject({ code: "invalid_steps" });
    await expect(save([{ ...STEPS[1], amount: 0 }])).rejects.toMatchObject({ code: "invalid_step_time" });
    await expect(save([{ ...STEPS[1], time: "25:00" }])).rejects.toMatchObject({ code: "invalid_step_time" });
    await expect(save([{ ...STEPS[2], amount: 73 }])).rejects.toMatchObject({ code: "invalid_step_time" });
    await expect(save([{ ...STEPS[1], template: "Olá {nome}, veja {link_reagendar}" }])).rejects.toMatchObject({
      code: "invalid_template",
      details: ["Passo 1: variável {nome} não existe", "Passo 1: variável {link_reagendar} não existe"],
    });
    await expect(save([{ ...STEPS[1], statuses: "scheduled_confirmed" }])).rejects.toMatchObject({ code: "confirmation_scheduled_only" });
    await expect(saveCadence(manager, id, input({ name: " " }))).rejects.toMatchObject({ code: "cadence_name_required" });
  });

  it("is only for whoever edits the cadence", async () => {
    await expect(createCadence(secretary, "Secretária")).rejects.toMatchObject({ code: "not_allowed" });
    const id = await createCadence(manager, "Do gestor");
    await expect(saveCadence(secretary, id, input())).rejects.toMatchObject({ code: "not_allowed" });
    const other = await createAgendaFixture("Outra conta do editor");
    const outsider = await contextAs(other, "PRACTICE_MANAGER");
    await expect(saveCadence(outsider, id, input())).rejects.toMatchObject({ code: "cadence_unavailable" });
  });
});

describe("saving replans what the change touches (PRD 6, rule 7)", () => {
  it("keeps the dispatches of the next 24 h and plans the new version after them", async () => {
    const practice = await createAgendaFixture("Consultório Versão");
    await openWindowAllDay(practice.practiceId);
    await addInstance(practice.practiceId, practice.professionals.ana.id);
    const gestor = await contextAs(practice, "PRACTICE_MANAGER");
    const id = await createCadence(gestor, "Relativa");
    const relative = (hours: number[]): CadenceInput["steps"] =>
      hours.map((amount) => ({ when: "hours", amount, time: "", statuses: "scheduled", action: "REMINDER", template: `H-${amount}` }));
    await saveCadence(gestor, id, input({ name: "Relativa", typeIds: [practice.types.consultation.id], steps: relative([36, 12]) }));

    const patient = await createPatient(practice.practiceId);
    const startsAt = new Date(Date.now() + 40 * 3_600_000);
    const local = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Fortaleza", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(startsAt);
    const { id: appointmentId } = await createAppointment(await contextAs(practice, "SECRETARY"), {
      patientId: patient.id,
      professionalId: practice.professionals.ana.id,
      locationId: practice.locations.aldeota.id,
      appointmentTypeId: practice.types.consultation.id,
      date: local.slice(0, 10),
      time: local.slice(11, 16),
    });

    await saveCadence(gestor, id, input({ name: "Relativa", typeIds: [practice.types.consultation.id], steps: relative([30, 6]) }));
    const dispatches = await dispatchesOf(practice.practiceId, appointmentId);
    expect(dispatches.map((row) => [row.cadenceStep?.cadenceVersion, row.cadenceStep?.position, row.status])).toEqual([
      [2, 1, "SCHEDULED"],
      [2, 2, "CANCELED"],
      [3, 2, "SCHEDULED"],
    ]);
  });
});

describe("saveSendWindow", () => {
  it("saves the practice's window and margin, for the manager", async () => {
    await saveSendWindow(manager, { start: "07:30", end: "21:00", days: [1, 2, 3, 4, 5], marginHours: 3 });
    const practice = await prisma.practice.findUniqueOrThrow({ where: { id: fixture.practiceId } });
    expect(practice).toMatchObject({ sendWindowStart: "07:30", sendWindowEnd: "21:00", sendWindowDays: [1, 2, 3, 4, 5], sendMarginMinutes: 180 });
    await expect(saveSendWindow(secretary, { start: "08:00", end: "20:00", days: [1], marginHours: 2 })).rejects.toMatchObject({ code: "not_allowed" });
  });

  it("refuses a window that ends before it starts, without days or with a margin over 12 h", async () => {
    for (const window of [
      { start: "20:00", end: "08:00", days: [1], marginHours: 2 },
      { start: "08:00", end: "20:00", days: [], marginHours: 2 },
      { start: "08:00", end: "20:00", days: [7], marginHours: 2 },
      { start: "8h", end: "20:00", days: [1], marginHours: 2 },
      { start: "08:00", end: "20:00", days: [1], marginHours: 13 },
    ]) {
      await expect(saveSendWindow(manager, window)).rejects.toMatchObject({ code: "invalid_window" });
    }
  });
});

describe("cadencePreview (PRD 6, rule 6)", () => {
  it("plans the steps for an appointment next Tuesday at 10h, with the window and the 4 h limit", async () => {
    await saveSendWindow(manager, { start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5, 6], marginHours: 2 });
    const id = await createCadence(manager, "Prévia");
    await saveCadence(manager, id, input({ name: "Prévia" }));
    // Wednesday 28 October 2026, 15h in Fortaleza: the appointment is on Tuesday 3 November.
    const preview = await cadencePreview(manager, id, new Date("2026-10-28T18:00:00Z"));
    expect(preview.startsAt).toEqual(new Date("2026-11-03T13:00:00Z"));
    expect(preview.steps.map((step) => [step.position, step.at?.toISOString() ?? null, step.adjustment ?? step.skipped])).toEqual([
      [1, "2026-10-28T18:00:00.000Z", "none"],
      [2, "2026-11-02T21:00:00.000Z", "none"],
      [3, "2026-11-03T11:00:00.000Z", "rate_limited"],
    ]);
  });
});

describe("listChannels", () => {
  it("lists each professional's WhatsApp instance and status, and who has none", async () => {
    await addInstance(fixture.practiceId, fixture.professionals.ana.id, { status: "DISCONNECTED" });
    const channels = await listChannels(manager);
    expect(channels).toHaveLength(2);
    expect(channels.map((row) => [row.professionalName, row.status])).toEqual(
      expect.arrayContaining([
        ["Dr. Bruno Teste", null],
        ["Dra. Ana Teste", "DISCONNECTED"],
      ]),
    );
  });
});
