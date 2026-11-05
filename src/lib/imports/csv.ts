/**
 * CSV files of the spreadsheet import (D-48), as Excel and Google Sheets save them
 * in Brazil: ";" (Excel, since the comma is the decimal separator) or ",", in
 * UTF-8 or in Windows-1252 (Excel's plain "CSV"), with RFC 4180 quotes.
 */

export type CsvDelimiter = ";" | ",";

/** A data row and the file line it starts on (the header is line 1). */
export type CsvRow = { line: number; values: string[] };

export type ParsedCsv = { delimiter: CsvDelimiter; header: string[]; rows: CsvRow[] };

export class CsvError extends Error {
  override name = "CsvError";

  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
  }
}

const BOM = "﻿";

export function decodeCsv(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.startsWith(BOM) ? text.slice(1) : text;
}

/** The delimiter that appears more often in the first line, outside quotes. */
function detectDelimiter(text: string): CsvDelimiter {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char === ";") semicolons += 1;
    else if (!quoted && char === ",") commas += 1;
  }
  return commas > semicolons ? "," : ";";
}

/** Records with the line each starts on; quoted fields may hold delimiters and line breaks. */
function* records(text: string, delimiter: CsvDelimiter): Generator<CsvRow> {
  let values: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let start = 1;
  let quoteLine = 1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        if (char === "\n") line += 1;
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
      quoteLine = line;
    } else if (char === delimiter) {
      values.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      values.push(field);
      yield { line: start, values };
      values = [];
      field = "";
      line += 1;
      start = line;
    } else {
      field += char;
    }
  }
  if (quoted) throw new CsvError("Unclosed quote", quoteLine);
  if (field !== "" || values.length > 0) {
    values.push(field);
    yield { line: start, values };
  }
}

/** Parses a CSV, trimming cells and skipping rows whose cells are all empty. */
export function parseCsv(text: string): ParsedCsv {
  const delimiter = detectDelimiter(text);
  let header: string[] | null = null;
  const rows: CsvRow[] = [];
  for (const record of records(text, delimiter)) {
    const values = record.values.map((value) => value.trim());
    if (values.every((value) => value === "")) continue;
    if (header) rows.push({ line: record.line, values });
    else header = values;
  }
  return { delimiter, header: header ?? [], rows };
}

function quote(cell: string, delimiter: CsvDelimiter) {
  return /["\r\n]/.test(cell) || cell.includes(delimiter) ? `"${cell.replaceAll('"', '""')}"` : cell;
}

/** CSV text with CRLF line ends, as Excel writes it. */
export function toCsv(rows: string[][], delimiter: CsvDelimiter = ";") {
  return rows.map((row) => row.map((cell) => quote(cell, delimiter)).join(delimiter)).join("\r\n");
}

/** "Convênio " → "convenio", "Duração (min)" → "duracao_min". */
export function normalizeHeader(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
