import { describe, expect, it } from "vitest";
import { CsvError, decodeCsv, normalizeHeader, parseCsv, toCsv } from "./csv";

// Spreadsheet files of the import (D-48): what Excel and Google Sheets save in
// Brazil, with ";" or "," and in UTF-8 or Windows-1252.

describe("decodeCsv", () => {
  it("reads UTF-8 with and without the byte order mark", () => {
    const text = "nome;convênio\nJoão;Unimed";
    expect(decodeCsv(new TextEncoder().encode(text))).toBe(text);
    expect(decodeCsv(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(text)]))).toBe(text);
  });

  it("falls back to Windows-1252, the encoding of Excel's plain CSV", () => {
    expect(decodeCsv(Buffer.from("nome;convênio\nJoão;Assistência", "latin1"))).toBe("nome;convênio\nJoão;Assistência");
  });
});

describe("parseCsv", () => {
  it("detects the delimiter from the header and keeps the line of each row", () => {
    const semicolon = parseCsv("nome;celular\r\nAna;85 99999-0000\r\n\r\nBia;85 98888-0000\r\n");
    expect(semicolon.delimiter).toBe(";");
    expect(semicolon.header).toEqual(["nome", "celular"]);
    expect(semicolon.rows).toEqual([
      { line: 2, values: ["Ana", "85 99999-0000"] },
      { line: 4, values: ["Bia", "85 98888-0000"] },
    ]);
    expect(parseCsv("nome,celular\nAna,85999990000").delimiter).toBe(",");
  });

  it("handles quotes, doubled quotes, delimiters and line breaks inside a field", () => {
    const parsed = parseCsv('nome;observacoes\n"Silva; Ana";"Disse ""oi""\nna recepção"\nBia;fim');
    expect(parsed.rows).toEqual([
      { line: 2, values: ["Silva; Ana", 'Disse "oi"\nna recepção'] },
      { line: 4, values: ["Bia", "fim"] },
    ]);
  });

  it("skips rows with only empty cells, as Excel leaves them", () => {
    expect(parseCsv("nome;celular\nAna;1\n;\n ; \n").rows).toEqual([{ line: 2, values: ["Ana", "1"] }]);
  });

  it("trims cells and the header", () => {
    expect(parseCsv(" nome ; celular \n Ana ;  1 ").rows[0].values).toEqual(["Ana", "1"]);
  });

  it("reports an unclosed quote with its line", () => {
    expect(() => parseCsv('nome;obs\nAna;ok\nBia;"sem fim\n')).toThrow(CsvError);
    try {
      parseCsv('nome;obs\nAna;ok\nBia;"sem fim\n');
    } catch (error) {
      expect((error as CsvError).line).toBe(3);
    }
  });

  it("returns no header for an empty file", () => {
    expect(parseCsv("")).toEqual({ delimiter: ";", header: [], rows: [] });
    expect(parseCsv("\n\n").header).toEqual([]);
  });
});

describe("toCsv", () => {
  it("quotes only what needs quotes and reads back the same", () => {
    const rows = [
      ["linha", "nome", "erro"],
      ["3", 'Ana "Bia"', "Celular inválido; informe o DDD"],
      ["4", "Linha\nquebrada", ""],
    ];
    const text = toCsv(rows);
    expect(text.split("\r\n")[0]).toBe("linha;nome;erro");
    const parsed = parseCsv(text);
    expect([parsed.header, ...parsed.rows.map((row) => row.values)]).toEqual(rows.map((row) => row.map((cell) => cell.trim())));
  });
});

describe("normalizeHeader", () => {
  it("ignores accents, case, spaces and punctuation", () => {
    expect(normalizeHeader(" Convênio ")).toBe("convenio");
    expect(normalizeHeader("Consentimento WhatsApp")).toBe("consentimento_whatsapp");
    expect(normalizeHeader("Duração (min)")).toBe("duracao_min");
    expect(normalizeHeader("observações")).toBe("observacoes");
  });
});
