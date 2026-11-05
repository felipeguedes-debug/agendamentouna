import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { decodeCsv, parseCsv } from "./csv";
import {
  AGENDA_COLUMNS,
  mapColumns,
  matchKey,
  parseDate,
  parseImportStatus,
  parseLeadSource,
  parseTime,
  parseYesNo,
  PATIENT_COLUMNS,
} from "./templates";

// Columns of the two spreadsheet templates and how their cells are read (D-18, D-48).

function template(name: string) {
  return parseCsv(decodeCsv(readFileSync(path.join(process.cwd(), "public", "modelos", name))));
}

describe("templates in public/modelos", () => {
  it("have exactly the patient columns, in order", () => {
    const parsed = template("pacientes.csv");
    expect(parsed.delimiter).toBe(";");
    expect(parsed.header).toEqual(PATIENT_COLUMNS.map((column) => column.key));
    expect(parsed.rows.length).toBeGreaterThan(0);
  });

  it("have exactly the agenda columns, in order, with example rows that read", () => {
    const parsed = template("agenda.csv");
    expect(parsed.header).toEqual(AGENDA_COLUMNS.map((column) => column.key));
    const { index } = mapColumns(parsed.header, AGENDA_COLUMNS);
    for (const row of parsed.rows) {
      expect(parseDate(row.values[index.get("data")!]), `line ${row.line}`).not.toBeNull();
      expect(parseTime(row.values[index.get("hora")!]), `line ${row.line}`).not.toBeNull();
      expect(parseImportStatus(row.values[index.get("status")!]), `line ${row.line}`).not.toBeNull();
    }
  });

  it("start with a byte order mark, so Excel opens the accents right", () => {
    for (const name of ["pacientes.csv", "agenda.csv"]) {
      expect([...readFileSync(path.join(process.cwd(), "public", "modelos", name)).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    }
  });
});

describe("mapColumns", () => {
  it("finds columns by normalized name or alias and lists the missing required ones", () => {
    const { index, missing } = mapColumns(["Nome", "Telefone", "Plano", "linha", "erro"], PATIENT_COLUMNS);
    expect(index.get("nome")).toBe(0);
    expect(index.get("celular")).toBe(1);
    expect(index.get("convenio")).toBe(2);
    expect(index.has("observacoes")).toBe(false);
    expect(missing).toEqual([]);
    expect(mapColumns(["nome", "convenio"], PATIENT_COLUMNS).missing).toEqual(["celular"]);
  });

  it("uses the first column when two names map to the same key", () => {
    expect(mapColumns(["celular", "telefone", "nome"], PATIENT_COLUMNS).index.get("celular")).toBe(0);
  });
});

describe("cell readers", () => {
  it("reads Brazilian and ISO dates, and rejects impossible ones", () => {
    expect(parseDate("05/03/2027")).toBe("2027-03-05");
    expect(parseDate("5/3/2027")).toBe("2027-03-05");
    expect(parseDate("2027-03-05")).toBe("2027-03-05");
    expect(parseDate("31/02/2027")).toBeNull();
    expect(parseDate("05/03/27")).toBeNull();
    expect(parseDate("")).toBeNull();
  });

  it("reads the times people and Excel write", () => {
    expect(parseTime("09:30")).toBe("09:30");
    expect(parseTime("9:30")).toBe("09:30");
    expect(parseTime("9h30")).toBe("09:30");
    expect(parseTime("14h")).toBe("14:00");
    expect(parseTime("09:30:00")).toBe("09:30");
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("9")).toBeNull();
  });

  it("reads yes and no", () => {
    expect(["sim", "Sim", "S", "x", "1"].map(parseYesNo)).toEqual(["yes", "yes", "yes", "yes", "yes"]);
    expect(["não", "nao", "N", "0"].map(parseYesNo)).toEqual(["no", "no", "no", "no"]);
    expect(parseYesNo("")).toBe("empty");
    expect(parseYesNo("talvez")).toBe("invalid");
  });

  it("reads the importable statuses by their labels, Agendado when empty", () => {
    expect(parseImportStatus("")).toBe("SCHEDULED");
    expect(parseImportStatus("confirmado")).toBe("CONFIRMED");
    expect(parseImportStatus("Atendido")).toBe("COMPLETED");
    expect(parseImportStatus("faltou")).toBe("NO_SHOW");
    expect(parseImportStatus("Cancelado pelo paciente")).toBe("CANCELED_BY_PATIENT");
    expect(parseImportStatus("cancelado pelo consultorio")).toBe("CANCELED_BY_PRACTICE");
    expect(parseImportStatus("Chegou")).toBeNull();
    expect(parseImportStatus("Reagendado")).toBeNull();
    expect(parseImportStatus("cancelado")).toBeNull();
  });

  it("reads the lead source by its label", () => {
    expect(parseLeadSource("")).toBeNull();
    expect(parseLeadSource("Indicação")).toBe("REFERRAL");
    expect(parseLeadSource("instagram")).toBe("INSTAGRAM");
    expect(parseLeadSource("panfleto")).toBe("invalid");
  });

  it("matches names without accents, case or extra spaces", () => {
    expect(matchKey("  Dra.  Ana   Lúcia ")).toBe("dra. ana lucia");
  });
});
