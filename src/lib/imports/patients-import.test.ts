import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PracticeContext } from "@/lib/auth/access";
import { prisma } from "@/lib/db";
import { contextAs, createAgendaFixture, type AgendaFixture } from "../../../tests/helpers/practice";
import { ImportFileError } from "./errors";
import { importPatients } from "./patients-import";

// Patient spreadsheet import (PRD 4 rule 9; D-18, D-48): deduplicated by the
// normalized phone within the practice, with a report of errors by line.

let fixture: AgendaFixture;
let other: AgendaFixture;
let manager: PracticeContext;

beforeAll(async () => {
  fixture = await createAgendaFixture("Consultório Importa Pacientes");
  other = await createAgendaFixture("Consultório Importa Pacientes Outro");
  manager = await contextAs(fixture, "PRACTICE_MANAGER");
});

afterAll(async () => {
  await prisma.$disconnect();
});

const csv = (lines: string[]) => new TextEncoder().encode(lines.join("\n"));

describe("importPatients", () => {
  it("creates new patients, keeps existing ones and reports invalid lines", async () => {
    await other.db.patient.create({ data: { practiceId: other.practiceId, name: "Rosa Outra Conta", phone: "+5585970001003" } });
    const report = await importPatients(
      manager,
      csv([
        "nome;celular;convenio;observacoes;consentimento_whatsapp",
        "Ana Importada;(85) 97000-1001;Unimed;Prefere tarde;sim",
        "Bruna Importada;85970001002;;;não",
        "Rosa Mesma Pessoa;+55 85 97000-1003;;;",
        "Maria Souza Duplicada;85 99812-4455;;;sim",
        ";85970001005;;;",
        "Sem Celular;;;;",
        "Celular Curto;1234;;;",
        "Consentimento Estranho;85970001008;;;talvez",
        "Ana Repetida;85 97000 1001;;;",
      ]),
    );
    expect(report).toMatchObject({ totalRows: 9, created: 3, existing: 1 });
    expect(report.errors.map((error) => [error.line, error.messages])).toEqual([
      [6, ["Informe o nome."]],
      [7, ["Informe o celular."]],
      [8, ["Celular inválido: informe o DDD e o número."]],
      [9, ["Consentimento de WhatsApp deve ser sim, não ou vazio."]],
      [10, ["Celular repetido na planilha (linha 2)."]],
    ]);
    expect(report.errors[0].values).toEqual(["", "85970001005", "", "", ""]);

    const ana = await fixture.db.patient.findFirstOrThrow({ where: { phone: "+5585970001001" } });
    expect(ana).toMatchObject({ name: "Ana Importada", insurance: "Unimed", notes: "Prefere tarde", searchName: "ana importada" });
    const bruna = await fixture.db.patient.findFirstOrThrow({ where: { phone: "+5585970001002" } });
    expect(bruna.insurance).toBe("Particular");
    // The same phone in another practice is another patient (isolation).
    expect(await fixture.db.patient.findFirst({ where: { phone: "+5585970001003" } })).toMatchObject({ name: "Rosa Mesma Pessoa" });
    // The existing patient keeps name and data.
    expect((await fixture.db.patient.findUniqueOrThrow({ where: { id: fixture.patient.id } })).name).toBe("Maria Souza");

    const consents = await fixture.db.contactConsent.findMany({ where: { patientId: { in: [ana.id, bruna.id, fixture.patient.id] } } });
    expect(consents.map((row) => [row.patientId, row.granted, row.channel, row.recordedByUserId])).toEqual(
      expect.arrayContaining([
        [ana.id, true, "IMPORT", manager.user.id],
        [bruna.id, false, "IMPORT", manager.user.id],
      ]),
    );
    expect(consents).toHaveLength(2);
    expect(await fixture.db.auditEvent.count({ where: { action: "patient.imported", actorUserId: manager.user.id } })).toBe(3);
  });

  it("is safe to run twice: the second run only finds existing patients", async () => {
    const file = csv(["Nome,Telefone", "Caio Duas Vezes,85970002001", "Dora Duas Vezes,85970002002"]);
    expect(await importPatients(manager, file)).toMatchObject({ created: 2, existing: 0, errors: [] });
    expect(await importPatients(manager, file)).toMatchObject({ created: 0, existing: 2, errors: [] });
  });

  it("does not match an anonymized patient, whose phone was erased", async () => {
    await fixture.db.patient.create({ data: { practiceId: fixture.practiceId, name: "Paciente excluído", anonymizedAt: new Date() } });
    expect(await importPatients(manager, csv(["nome;celular", "Paciente excluído;85970003001"]))).toMatchObject({ created: 1, existing: 0 });
  });

  it("imports thousands of rows in batches", async () => {
    const rows = Array.from({ length: 2500 }, (_, index) => `Lote ${index};8596${String(index).padStart(7, "0")}`);
    const report = await importPatients(manager, csv(["nome;celular", ...rows]));
    expect(report).toMatchObject({ totalRows: 2500, created: 2500, errors: [] });
  }, 60_000);

  it("refuses files without the required columns, empty or too big", async () => {
    const failure = (bytes: Uint8Array) => importPatients(manager, bytes).catch((error: unknown) => error);
    expect(await failure(csv(["nome;convenio", "Ana;Unimed"]))).toMatchObject({ code: "missing_columns", detail: "celular" });
    expect(await failure(csv([""]))).toMatchObject({ code: "empty" });
    expect(await failure(csv(["nome;celular"]))).toMatchObject({ code: "empty" });
    expect(await failure(new Uint8Array(901 * 1024))).toMatchObject({ code: "too_large" });
    expect(await failure(csv(["nome;celular", 'Ana;"85'])) ).toBeInstanceOf(ImportFileError);
  });

  it("is for the manager and the admin", async () => {
    const secretary = await contextAs(fixture, "SECRETARY");
    await expect(importPatients(secretary, csv(["nome;celular", "Eva;85970004001"]))).rejects.toMatchObject({ code: "not_allowed" });
    const admin = await contextAs(fixture, "ORG_ADMIN");
    expect(await importPatients(admin, csv(["nome;celular", "Eva;85970004001"]))).toMatchObject({ created: 1 });
  });
});
