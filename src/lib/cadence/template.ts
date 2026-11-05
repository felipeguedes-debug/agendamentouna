import type { AppointmentCategory } from "@/generated/prisma/enums";
import { formatTime } from "@/lib/dates/zoned";
import { appointmentTypeDisplayName } from "@/lib/domain/labels";
import { formatCents } from "@/lib/domain/money";

/**
 * Message text of a cadence step (PRD 6, "Variáveis de texto"). {tipo} is the
 * type's display name, never the internal name (D-14). {link_reagendar} is phase 2.
 * Dates and times are those of the appointment's location (D-03).
 */

export const TEMPLATE_VARIABLES = ["primeiro_nome", "profissional", "tipo", "data_extenso", "hora", "endereco", "preparo", "valor"] as const;

export const MAX_TEMPLATE_LENGTH = 1000;

const VARIABLE = /\{([a-z_]+)\}/g;
const known = new Set<string>(TEMPLATE_VARIABLES);

export type TemplateValues = {
  patientName: string;
  professionalName: string;
  type: { displayName: string | null; category: AppointmentCategory; preparation: string | null };
  startsAt: Date;
  timeZone: string;
  address: string;
  priceCents: number;
};

const longDates = new Map<string, Intl.DateTimeFormat>();

/** "terça-feira, 3 de novembro" */
function longDate(instant: Date, timeZone: string) {
  let formatter = longDates.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("pt-BR", { timeZone, weekday: "long", day: "numeric", month: "long" });
    longDates.set(timeZone, formatter);
  }
  return formatter.format(instant);
}

export function renderTemplate(template: string, values: TemplateValues) {
  const filled: Record<(typeof TEMPLATE_VARIABLES)[number], string> = {
    primeiro_nome: values.patientName.trim().split(/\s+/)[0] ?? "",
    profissional: values.professionalName,
    tipo: appointmentTypeDisplayName(values.type),
    data_extenso: longDate(values.startsAt, values.timeZone),
    hora: formatTime(values.startsAt, values.timeZone),
    endereco: values.address,
    preparo: values.type.preparation ?? "",
    valor: formatCents(values.priceCents),
  };
  return template.replace(VARIABLE, (match, name: string) => (known.has(name) ? filled[name as keyof typeof filled] : match));
}

/** Codes of what is wrong with a step's text; empty when it can be saved. */
export function templateProblems(template: string) {
  if (!template.trim()) return ["empty"];
  if (template.length > MAX_TEMPLATE_LENGTH) return ["too_long"];
  return [...template.matchAll(VARIABLE)].filter((match) => !known.has(match[1])).map((match) => `unknown_variable:${match[0]}`);
}
