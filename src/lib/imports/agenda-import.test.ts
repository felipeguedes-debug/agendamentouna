import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { enableImportedCadence, importAgenda, importedWithoutCadence } from "./agenda-import";

// Agenda spreadsheet import (PRD 4 rule 9; D-18, D-48). Done criterion of Block 4
// (PRD 12): a 500-line spreadsheet imports with a report of errors by line.
// Imported appointments start with the cadence off; their status comes through
// changeAppointmentStatus with IMPORT as the source.

const NOW = new Date("2027-01-01T12:00:00Z");
const HEADER = "data;hora;profissional;unidade;tipo;paciente;celular;convenio;status;duracao;valor;observacao;origem";
const BRUNO = "Dr. Bruno Teste";
const ANA = "Dra. Ana Teste";
const CONSULTA = "Primeira consulta";

let fixture: AgendaFixture;
let manager: PracticeContext;

type Row = Partial<Record<"data" | "hora" | "profissional" | "unidade" | "tipo" | "paciente" | "celular" | "convenio" | "status" | "duracao" | "valor" | "observacao" | "origem", string>>;

function line(row: Row) {
  const columns = ["data", "hora", "profissional", "unidade", "tipo", "paciente", "celular", "convenio", "status", "duracao", "valor", "observacao", "origem"] as const;
  return columns.map((column) => row[column] ?? "").join(";");
}

const csv = (rows: Row[]) => new TextEncoder().encode([HEADER, ...rows.map(line)].join("\r\n"));

const SLOTS = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];

/** 478 valid bookings for Bruno from 1 Feb to 20 Mar 2027, ten a day, for 100 patients. */
function generatedRows(): Row[] {
  return Array.from({ length: 478 }, (_, index) => {
    const day = new Date(Date.UTC(2027, 1, 1) + Math.floor(index / SLOTS.length) * 86_400_000);
    const patient = index % 100;
    return {
      data: `${String(day.getUTCDate()).padStart(2, "0")}/${String(day.getUTCMonth() + 1).padStart(2, "0")}/${day.getUTCFullYear()}`,
      hora: SLOTS[index % SLOTS.length],
      profissional: BRUNO,
      tipo: CONSULTA,
      paciente: `Paciente Planilha ${patient}`,
      celular: `8598${String(patient).padStart(7, "0")}`,
    };
  });
}

const phone = (n: number) => `8597${String(n).padStart(7, "0")}`;

/** Lines 480 to 501: one case each, in this order. */
function specialRows(): { row: Row; error?: RegExp; existing?: true }[] {
  return [
    { row: { data: "31/02/2027", hora: "09:00", profissional: BRUNO, tipo: CONSULTA, paciente: "Erro Data", celular: phone(1) }, error: /Data inválida/ },
    { row: { data: "01/03/2027", hora: "25:00", profissional: BRUNO, tipo: CONSULTA, paciente: "Erro Hora", celular: phone(2) }, error: /Hora inválida/ },
    { row: { data: "01/03/2027", hora: "09:00", profissional: "Dr. Ninguém", tipo: CONSULTA, paciente: "Erro Profissional", celular: phone(3) }, error: /Profissional não encontrado: Dr\. Ninguém/ },
    { row: { data: "01/03/2027", hora: "09:00", profissional: BRUNO, tipo: "Massagem", paciente: "Erro Tipo", celular: phone(4) }, error: /Tipo de atendimento não encontrado: Massagem/ },
    { row: { data: "01/03/2027", hora: "09:00", profissional: BRUNO, tipo: CONSULTA, paciente: "Erro Celular", celular: "123" }, error: /Celular inválido/ },
    { row: { data: "01/03/2027", hora: "09:00", profissional: BRUNO, tipo: CONSULTA, paciente: "Erro Status", celular: phone(6), status: "Chegou" }, error: /Status não importável: Chegou/ },
    { row: { data: "01/03/2027", hora: "09:00", profissional: ANA, tipo: CONSULTA, paciente: "Erro Sem Unidade", celular: phone(7) }, error: /Informe a unidade/ },
    { row: { data: "01/03/2027", hora: "09:00", profissional: BRUNO, unidade: "Unidade Manaus", tipo: CONSULTA, paciente: "Erro Unidade", celular: phone(8) }, error: /não atende na Unidade Manaus/ },
    // Same slot as the first generated row, another patient: the first one wins.
    { row: { data: "01/02/2027", hora: "08:00", profissional: BRUNO, tipo: CONSULTA, paciente: "Conflito Planilha", celular: phone(9) }, error: /Conflito de horário.*Paciente Planilha 0/ },
    { row: { data: "01/03/2027", hora: "09:00", profissional: ANA, unidade: "Unidade Aldeota", tipo: CONSULTA, paciente: "Conflito Banco", celular: phone(10) }, error: /Conflito de horário.*Maria Souza/ },
    { row: { data: "02/03/2027", hora: "10:30", profissional: ANA, unidade: "unidade aldeota", tipo: CONSULTA, paciente: "Conflito Bloqueio", celular: phone(11) }, error: /Conflito de horário.*Bloqueio: Congresso/ },
    // The second generated row again: already there, not an error.
    { row: { ...generatedRows()[1] }, existing: true },
    { row: { data: "02/03/2027", hora: "08:00", profissional: BRUNO, tipo: CONSULTA, paciente: "Erro Futuro Atendido", celular: phone(13), status: "Atendido" }, error: /futuro não pode estar Atendido nem Faltou/ },
    { row: { data: "02/03/2027", hora: "08:00", profissional: BRUNO, tipo: CONSULTA, paciente: "Erro Valor", celular: phone(14), valor: "abc" }, error: /Valor inválido/ },
    { row: { data: "02/03/2027", hora: "08:00", profissional: BRUNO, tipo: CONSULTA, paciente: "Erro Duração", celular: phone(15), duracao: "3" }, error: /Duração inválida/ },
    // Past visit in Manaus (UTC-4), closed in the previous system.
    { row: { data: "10/12/2026", hora: "14:00", profissional: ANA, unidade: "Unidade Manaus", tipo: CONSULTA, paciente: "Passado Atendido", celular: phone(16), status: "Atendido" } },
    { row: { data: "2026-12-11", hora: "8h", profissional: BRUNO, tipo: CONSULTA, paciente: "Passado Faltou", celular: phone(17), status: "faltou" } },
    {
      row: {
        data: "05/03/2027",
        hora: "08:00",
        profissional: "dra. ana teste",
        unidade: "Unidade Manaus",
        tipo: "primeira CONSULTA",
        paciente: "Futuro Confirmado",
        celular: phone(18),
        convenio: "Bradesco",
        status: "Confirmado",
        duracao: "45",
        valor: "R$ 300,00",
        observacao: "Trazer exames",
        origem: "Indicação",
      },
    },
    // Canceled holds no time: no conflict with the third generated row.
    { row: { data: "01/02/2027", hora: "09:00", profissional: BRUNO, tipo: CONSULTA, paciente: "Cancelado Junto", celular: phone(19), status: "Cancelado pelo paciente" } },
    // A patient already registered: found by phone, the name in the sheet is ignored.
    { row: { data: "10/04/2027", hora: "08:00", profissional: BRUNO, tipo: CONSULTA, paciente: "Maria S.", celular: "(85) 99812-4455" } },
    { row: { data: "10/04/2027", hora: "09:00", profissional: BRUNO, tipo: "Tipo Antigo", paciente: "Erro Inativo", celular: phone(21) }, error: /Tipo de atendimento inativo: Tipo Antigo/ },
    { row: { data: "10/04/2027", hora: "10:00", profissional: BRUNO, tipo: CONSULTA, paciente: "", celular: phone(22) }, error: /Informe o nome do paciente/ },
  ];
}

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Importa Agenda");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
  const { db, practiceId } = fixture;
  await db.appointment.create({
    data: {
      practiceId,
      locationId: fixture.locations.aldeota.id,
      professionalId: fixture.professionals.ana.id,
      patientId: fixture.patient.id,
      appointmentTypeId: fixture.types.consultation.id,
      startsAt: new Date("2027-03-01T12:00:00Z"),
      endsAt: new Date("2027-03-01T12:30:00Z"),
      durationMinutes: 30,
      priceCents: 45000,
    },
  });
  await db.timeBlock.create({
    data: {
      practiceId,
      professionalId: fixture.professionals.ana.id,
      startsAt: new Date("2027-03-02T13:00:00Z"),
      endsAt: new Date("2027-03-02T15:00:00Z"),
      reason: "Congresso",
    },
  });
  await db.appointmentType.create({
    data: { practiceId, name: "Tipo Antigo", category: "CONSULTATION", durationMinutes: 30, defaultPriceCents: 10000, color: "#0F766E", active: false },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("importAgenda with a 500-line spreadsheet", () => {
  it("imports the valid lines and reports the others by line, without stopping", async () => {
    const special = specialRows();
    const rows = [...generatedRows(), ...special.map((item) => item.row)];
    expect(rows).toHaveLength(500);

    const started = Date.now();
    const report = await importAgenda(manager, csv(rows), NOW);
    const elapsed = Date.now() - started;

    const expectedErrors = special.flatMap((item, index) => (item.error ? [{ line: 480 + index, error: item.error }] : []));
    expect(report).toMatchObject({ totalRows: 500, created: 483, existing: 1, patientsCreated: 107, patientsExisting: 1 });
    expect(report.errors.map((error) => error.line)).toEqual(expectedErrors.map((error) => error.line));
    for (const [index, error] of report.errors.entries()) {
      expect(error.messages.join(" "), `line ${error.line}`).toMatch(expectedErrors[index].error);
    }
    expect(report.errors[0].values).toEqual(line(special[0].row).split(";"));
    console.info(`500-line agenda import: ${elapsed} ms`);
  }, 120_000);

  it("leaves the cadence off and records IMPORT as the source of creation and status", async () => {
    const { db } = fixture;
    const imported = await db.appointment.findMany({ where: { createdByUserId: manager.user.id } });
    expect(imported).toHaveLength(483);
    expect(imported.every((row) => row.cadenceEnabled === false)).toBe(true);

    const past = await db.appointment.findFirstOrThrow({
      where: { patient: { phone: "+5585970000016" } },
      include: { statusChanges: { orderBy: { changedAt: "asc" } } },
    });
    expect(past).toMatchObject({ status: "COMPLETED", startsAt: new Date("2026-12-10T18:00:00Z"), locationId: fixture.locations.manaus.id });
    expect(past.statusChanges.map((change) => [change.fromStatus, change.toStatus, change.source, change.changedByUserId])).toEqual([
      [null, "SCHEDULED", "IMPORT", manager.user.id],
      ["SCHEDULED", "COMPLETED", "IMPORT", manager.user.id],
    ]);
    const audit = await db.auditEvent.findMany({ where: { entityId: past.id }, orderBy: { occurredAt: "asc" } });
    expect(audit.map((event) => [event.action, event.changedFields])).toEqual([
      ["appointment.imported", []],
      ["appointment.status_changed", ["status"]],
    ]);

    const confirmed = await db.appointment.findFirstOrThrow({ where: { patient: { phone: "+5585970000018" } } });
    expect(confirmed).toMatchObject({
      status: "CONFIRMED",
      professionalId: fixture.professionals.ana.id,
      locationId: fixture.locations.manaus.id,
      startsAt: new Date("2027-03-05T12:00:00Z"),
      endsAt: new Date("2027-03-05T12:45:00Z"),
      durationMinutes: 45,
      priceCents: 30000,
      insurance: "Bradesco",
      internalNote: "Trazer exames",
      leadSource: "REFERRAL",
    });

    // Value and duration copied from the type when the sheet leaves them out (D-12).
    const generated = await db.appointment.findFirstOrThrow({ where: { patient: { phone: "+5585980000000" } }, orderBy: { startsAt: "asc" } });
    expect(generated).toMatchObject({ status: "SCHEDULED", priceCents: 45000, durationMinutes: 30, insurance: "Particular", startsAt: new Date("2027-02-01T11:00:00Z") });
    expect(await db.patient.findFirstOrThrow({ where: { phone: "+5585980000000" } })).toMatchObject({ name: "Paciente Planilha 0" });

    const maria = await db.appointment.findFirstOrThrow({ where: { patientId: fixture.patient.id, createdByUserId: manager.user.id } });
    expect(maria.startsAt).toEqual(new Date("2027-04-10T11:00:00Z"));
    expect((await db.patient.findUniqueOrThrow({ where: { id: fixture.patient.id } })).name).toBe("Maria Souza");
  });

  it("is safe to run again: what was imported is found, not duplicated", async () => {
    const rows = [...generatedRows(), ...specialRows().map((item) => item.row)];
    const report = await importAgenda(manager, csv(rows), NOW);
    expect(report).toMatchObject({ totalRows: 500, created: 0, existing: 484, patientsCreated: 0 });
    expect(report.errors).toHaveLength(16);
  }, 120_000);
});

describe("cadence of imported appointments (D-18)", () => {
  it("lists the future open ones with the cadence off and lets the manager turn it on in batches", async () => {
    const pending = await importedWithoutCadence(manager, NOW);
    expect(pending).toEqual([
      { professionalId: fixture.professionals.bruno.id, professionalName: BRUNO, count: 479 },
      { professionalId: fixture.professionals.ana.id, professionalName: ANA, count: 1 },
    ]);

    const secretary = await contextAs(fixture, "SECRETARY");
    await expect(enableImportedCadence(secretary, {}, NOW)).rejects.toMatchObject({ code: "not_allowed" });

    expect(await enableImportedCadence(manager, { professionalId: fixture.professionals.ana.id }, NOW)).toBe(1);
    expect((await importedWithoutCadence(manager, NOW)).map((row) => row.professionalName)).toEqual([BRUNO]);
    expect(await enableImportedCadence(manager, {}, NOW)).toBe(479);
    expect(await importedWithoutCadence(manager, NOW)).toEqual([]);

    const { db } = fixture;
    expect(await db.auditEvent.count({ where: { action: "appointment.cadence_enabled", actorUserId: manager.user.id } })).toBe(480);
    // Past and canceled imports keep the cadence off: there is nothing to send.
    expect(await db.appointment.count({ where: { createdByUserId: manager.user.id, cadenceEnabled: false } })).toBe(3);
  });
});

describe("importAgenda limits and permissions", () => {
  it("refuses more than 2,000 lines and missing columns", async () => {
    const rows = Array.from({ length: 2001 }, () => ({ data: "01/03/2027" }));
    await expect(importAgenda(manager, csv(rows), NOW)).rejects.toMatchObject({ code: "too_many_rows" });
    await expect(importAgenda(manager, new TextEncoder().encode("data;hora;paciente\n01/03/2027;09:00;Ana"), NOW)).rejects.toMatchObject({
      code: "missing_columns",
      detail: "profissional, tipo, celular",
    });
  });

  it("is for the manager and the admin", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    await expect(importAgenda(secretary, csv([]), NOW)).rejects.toMatchObject({ code: "not_allowed" });
  });
});
