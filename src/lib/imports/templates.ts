import type { AppointmentStatus, LeadSource } from "@/generated/prisma/enums";
import { IMPORTABLE_STATUSES } from "@/lib/appointments/status";
import { isIsoDate, type IsoDate } from "@/lib/dates/zoned";
import { LEAD_SOURCE_LABELS, STATUS_LABELS } from "@/lib/domain/labels";
import { normalizeHeader } from "./csv";

/**
 * Columns of the two import templates (public/modelos, D-18, D-48) and how their
 * cells are read. Headers match without accents or case, and a few common names
 * work as aliases; other columns are ignored, such as "linha" and "erro" in a
 * report sent back after fixing.
 */

export type ColumnSpec = { key: string; required: boolean; aliases: string[] };

export const PATIENT_COLUMNS: readonly ColumnSpec[] = [
  { key: "nome", required: true, aliases: ["paciente", "nome_do_paciente", "nome_completo"] },
  { key: "celular", required: true, aliases: ["telefone", "whatsapp", "fone", "celular_whatsapp"] },
  { key: "convenio", required: false, aliases: ["plano", "plano_de_saude"] },
  { key: "observacoes", required: false, aliases: ["observacao", "obs"] },
  { key: "consentimento_whatsapp", required: false, aliases: ["aceita_whatsapp", "consentimento"] },
];

export const AGENDA_COLUMNS: readonly ColumnSpec[] = [
  { key: "data", required: true, aliases: ["dia"] },
  { key: "hora", required: true, aliases: ["horario", "inicio"] },
  { key: "profissional", required: true, aliases: ["medico", "medica"] },
  { key: "unidade", required: false, aliases: ["local"] },
  { key: "tipo", required: true, aliases: ["tipo_de_atendimento", "procedimento"] },
  { key: "paciente", required: true, aliases: ["nome", "nome_do_paciente"] },
  { key: "celular", required: true, aliases: ["telefone", "whatsapp", "fone"] },
  { key: "convenio", required: false, aliases: ["plano"] },
  { key: "status", required: false, aliases: ["situacao"] },
  { key: "duracao", required: false, aliases: ["duracao_min", "duracao_minutos"] },
  { key: "valor", required: false, aliases: ["preco"] },
  { key: "observacao", required: false, aliases: ["observacoes", "obs", "observacao_interna"] },
  { key: "origem", required: false, aliases: ["origem_do_lead"] },
];

/** Where each column is in the file (the first one wins) and which required ones are missing. */
export function mapColumns(header: string[], columns: readonly ColumnSpec[]) {
  const normalized = header.map(normalizeHeader);
  const index = new Map<string, number>();
  for (const column of columns) {
    const position = normalized.findIndex((name) => name === column.key || column.aliases.includes(name));
    if (position >= 0) index.set(column.key, position);
  }
  const missing = columns.filter((column) => column.required && !index.has(column.key)).map((column) => column.key);
  return { index, missing };
}

/** For comparing names typed in a sheet with the ones in the practice. */
export function matchKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const BR_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/** "05/03/2027", "5/3/2027" or "2027-03-05". */
export function parseDate(value: string): IsoDate | null {
  const text = value.trim();
  if (isIsoDate(text)) return text;
  const match = BR_DATE.exec(text);
  if (!match) return null;
  const date = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return isIsoDate(date) ? date : null;
}

const TIME = /^(\d{1,2})(?::(\d{2})(?::\d{2})?|h(\d{2})?)$/i;

/** "09:30", "9:30", "9h30", "14h" or Excel's "09:30:00", as "HH:mm". */
export function parseTime(value: string): string | null {
  const match = TIME.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? match[3] ?? 0);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const YES = new Set(["sim", "s", "x", "1", "yes", "true", "aceita"]);
const NO = new Set(["nao", "n", "0", "no", "false", "recusa"]);

export function parseYesNo(value: string): "yes" | "no" | "empty" | "invalid" {
  const text = matchKey(value);
  if (!text) return "empty";
  if (YES.has(text)) return "yes";
  if (NO.has(text)) return "no";
  return "invalid";
}

/** The label of an importable status; Agendado when empty, null when not importable. */
export function parseImportStatus(value: string): AppointmentStatus | null {
  const text = matchKey(value);
  if (!text) return "SCHEDULED";
  return IMPORTABLE_STATUSES.find((status) => matchKey(STATUS_LABELS[status]) === text) ?? null;
}

export function parseLeadSource(value: string): LeadSource | null | "invalid" {
  const text = matchKey(value);
  if (!text) return null;
  const entry = Object.entries(LEAD_SOURCE_LABELS).find(([, label]) => matchKey(label) === text);
  return entry ? (entry[0] as LeadSource) : "invalid";
}
