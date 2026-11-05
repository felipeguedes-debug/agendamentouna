import type { AppointmentStatus } from "@/generated/prisma/enums";
import { formatDateBr, toZoned } from "@/lib/dates/zoned";
import { STATUS_LABELS } from "@/lib/domain/labels";
import { normalizePhone, phoneDigits } from "@/lib/patients/phone";
import type { CrmTag } from "./provider";

/**
 * The pure rules of the integration with SynkronosCRM (D-66, D-68): the secretary's
 * command tags, the status tags the agenda writes, the text of the notes and how a
 * webhook body is read.
 *
 * The two kinds of tag never mix: a status tag is output, written by the agenda and
 * overwritten by it, and only a command tag makes the agenda act. So the agenda's own
 * writes cannot act on anything. They also read differently, for whoever picks one from a
 * list: "Agenda: Confirmado" says what is, "Confirmar na agenda" says what to do (D-70).
 */

export type CrmCommand = "confirm" | "manual_contact";

/** In the order they are applied: confirming first, as contact made is implied. */
export const CRM_COMMAND_TAGS: Record<CrmCommand, string> = {
  confirm: "Confirmar na agenda",
  manual_contact: "Contato manual na agenda",
};

const COMMANDS = Object.keys(CRM_COMMAND_TAGS) as CrmCommand[];

export const CRM_STATUS_TAGS: Partial<Record<AppointmentStatus, string>> = {
  SCHEDULED: "Agenda: Agendado",
  CONFIRMED: "Agenda: Confirmado",
  COMPLETED: "Agenda: Atendido",
  NO_SHOW: "Agenda: Faltou",
  CANCELED_BY_PATIENT: "Agenda: Cancelado",
  CANCELED_BY_PRACTICE: "Agenda: Cancelado",
  RESCHEDULED: "Agenda: Reagendado",
};

export const ALL_STATUS_TAGS = [...new Set(Object.values(CRM_STATUS_TAGS))];

/** Every tag the agenda uses, created in the account when it connects. Colors from GET /v1/tag/color. */
export const CRM_TAGS: readonly CrmTag[] = [
  { name: CRM_COMMAND_TAGS.confirm, color: "BLUE_500" },
  { name: CRM_COMMAND_TAGS.manual_contact, color: "BLUE_500" },
  { name: "Agenda: Agendado", color: "YELLOW_500" },
  { name: "Agenda: Confirmado", color: "GREEN_500" },
  { name: "Agenda: Atendido", color: "GREEN_300" },
  { name: "Agenda: Faltou", color: "RED_500" },
  { name: "Agenda: Cancelado", color: "RED_300" },
  { name: "Agenda: Reagendado", color: "PURPLE_500" },
];

/** PRD 6: created, confirmed, rescheduled, canceled, attended, no-show. Chegou and Em atendimento stay out. */
export function isCrmSyncedStatus(status: AppointmentStatus) {
  return status in CRM_STATUS_TAGS;
}

/** The API compares tag names ignoring case and spells them in capitals on a contact (D-70), so names are never compared as they are. */
export function normalizeTag(tag: string) {
  return tag
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function matchesCommand(tag: string, command: CrmCommand) {
  return normalizeTag(tag) === normalizeTag(CRM_COMMAND_TAGS[command]);
}

/** The commands among a contact's tags, in the order they are applied. */
export function commandsIn(tags: readonly string[]): CrmCommand[] {
  return COMMANDS.filter((command) => tags.some((tag) => matchesCommand(tag, command)));
}

export function sameTag(a: string, b: string) {
  return normalizeTag(a) === normalizeTag(b);
}

/** The agenda's status tags among a contact's tags, spelled as the contact has them. */
export function statusTagsIn(tags: readonly string[]) {
  return tags.filter((tag) => ALL_STATUS_TAGS.some((status) => sameTag(tag, status)));
}

/** The tags of the contact that are commands, spelled as the contact has them. */
export function commandTagsIn(tags: readonly string[]) {
  return tags.filter((tag) => COMMANDS.some((command) => matchesCommand(tag, command)));
}

type AppointmentForTag = { status: AppointmentStatus; startsAt: Date };

const WAITING: readonly AppointmentStatus[] = ["SCHEDULED", "CONFIRMED"];

/**
 * A tag is one per contact, so it shows the patient's next appointment still waiting
 * for the visit; with none, the latest one that has a tag (D-68).
 */
export function statusTagOf(appointments: readonly AppointmentForTag[], now: Date) {
  const ascending = [...appointments].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const next = ascending.find((row) => WAITING.includes(row.status) && row.startsAt > now);
  if (next) return CRM_STATUS_TAGS[next.status] ?? null;
  const latest = ascending.reverse().find((row) => CRM_STATUS_TAGS[row.status]);
  return latest ? CRM_STATUS_TAGS[latest.status]! : null;
}

function localTime(startsAt: Date, timeZone: string) {
  const { date, time } = toZoned(startsAt, timeZone);
  return `${formatDateBr(date)} às ${time}`;
}

/**
 * What the conversation shows of an appointment (PRD 6): status, type, professional,
 * location and time. The type goes by its display name (D-14); the patient's name, the
 * phone and the internal note never go.
 */
export function statusNote(input: { status: AppointmentStatus; typeLabel: string; professionalName: string; locationName: string; startsAt: Date; timeZone: string }) {
  return `Agenda: ${STATUS_LABELS[input.status]} · ${input.typeLabel} · ${input.professionalName} · ${input.locationName} · ${localTime(input.startsAt, input.timeZone)}`;
}

export type CrmOutcome = "confirmed" | "already_confirmed" | "manual_contact" | "unknown_contact" | "no_cadence_message" | "appointment_passed" | "not_open";

const FAILURE_REASONS: Partial<Record<CrmOutcome, string>> = {
  unknown_contact: "nenhum paciente da agenda tem este celular.",
  no_cadence_message: "nenhuma mensagem de régua foi enviada a este paciente. Use a agenda.",
  appointment_passed: "o atendimento da última mensagem de régua já passou.",
  not_open: "o agendamento da última mensagem de régua já foi encerrado na agenda.",
};

/** The command came off the contact and nothing changed: the conversation says why. */
export function commandFailureNote(command: CrmCommand, outcome: CrmOutcome) {
  return `Agenda: a etiqueta "${CRM_COMMAND_TAGS[command]}" não foi aplicada: ${FAILURE_REASONS[outcome]}`;
}

export function manualContactNote(appointment: { startsAt: Date; timeZone: string }) {
  return `Agenda: contato manual registrado no agendamento de ${localTime(appointment.startsAt, appointment.timeZone)}.`;
}

export type CrmWebhookEvent = {
  eventType: string;
  date: string | null;
  contactId: string | null;
  companyId: string | null;
  phone: string | null;
  /** The contact's tags as the event tells them; null when it does not. */
  tags: string[] | null;
};

type Json = Record<string, unknown>;

const asRecord = (value: unknown): Json => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {});
const asString = (value: unknown) => (typeof value === "string" && value ? value : null);

function tagNames(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.flatMap((tag) => {
    const name = typeof tag === "string" ? tag : asString(asRecord(tag).name);
    return name ? [name] : [];
  });
}

/**
 * The documentation shows only the body of CONTACT_UPDATE (docs/flwchat.md), so this
 * reads the contact where the other events may keep it. The body is only a hint: the
 * agenda acts on what the API says when it reads the contact again (D-67).
 */
export function parseWebhookEvent(body: unknown): CrmWebhookEvent | null {
  const root = asRecord(body);
  const eventType = asString(root.eventType);
  if (!eventType) return null;
  const content = asRecord(root.content);
  const contact = asRecord(content.contact);
  const phone = asString(content.phonenumber) ?? asString(content.phoneNumber) ?? asString(contact.phonenumber) ?? asString(contact.phoneNumber);
  return {
    eventType,
    date: asString(root.date),
    contactId: asString(content.contactId) ?? asString(contact.id) ?? asString(content.id),
    companyId: asString(content.companyId) ?? asString(contact.companyId),
    phone: phone ? normalizePhone(phoneDigits(phone)) : null,
    tags: tagNames(content.tags) ?? tagNames(content.tagNames) ?? tagNames(contact.tags) ?? tagNames(contact.tagNames),
  };
}
