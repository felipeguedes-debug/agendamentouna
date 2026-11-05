import { CsvError, decodeCsv, parseCsv, type CsvDelimiter, type CsvRow } from "./csv";
import { ImportFileError, MAX_FILE_BYTES } from "./errors";
import { mapColumns, type ColumnSpec } from "./templates";

/** A row the import left out, with the cells as they were, for the report CSV. */
export type ImportRowError = { line: number; messages: string[]; values: string[] };

/**
 * What an import did (D-48). Nothing of it is stored: it would carry personal
 * data. The screen shows it and offers the rows with errors as a CSV to fix and
 * send again.
 */
export type ImportReport = {
  header: string[];
  delimiter: CsvDelimiter;
  totalRows: number;
  /** Patients (patient import) or appointments (agenda import) created. */
  created: number;
  /** Already in the practice: same phone, or same professional, patient and start. */
  existing: number;
  errors: ImportRowError[];
  /** Agenda import only: patients created or found by phone. */
  patientsCreated?: number;
  patientsExisting?: number;
};

/** Reads a spreadsheet and checks size, header and row count before anything is written. */
export function readSheet(bytes: Uint8Array, columns: readonly ColumnSpec[], maxRows: number) {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new ImportFileError("too_large");
  let parsed;
  try {
    parsed = parseCsv(decodeCsv(bytes));
  } catch (error) {
    if (error instanceof CsvError) throw new ImportFileError("unclosed_quote", String(error.line));
    throw error;
  }
  if (parsed.header.length === 0 || parsed.rows.length === 0) throw new ImportFileError("empty");
  const { index, missing } = mapColumns(parsed.header, columns);
  if (missing.length > 0) throw new ImportFileError("missing_columns", missing.join(", "));
  if (parsed.rows.length > maxRows) throw new ImportFileError("too_many_rows");
  const cell = (row: CsvRow, key: string) => {
    const position = index.get(key);
    return position === undefined ? "" : (row.values[position] ?? "");
  };
  return { ...parsed, cell };
}

export function rowError(row: CsvRow, messages: string[]): ImportRowError {
  return { line: row.line, messages, values: row.values };
}

/** Splits a list into chunks for batched queries and inserts. */
export function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
  return result;
}
