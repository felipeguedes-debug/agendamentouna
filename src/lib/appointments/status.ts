import type { AppointmentStatus } from "@/generated/prisma/enums";
import { can, type AccessRole, type Permission } from "@/lib/auth/permissions";

/**
 * Appointment statuses and the "Transições de status" table of PRD section 4
 * (D-10, D-11). Every status change goes through `checkTransition`; the services
 * in ./appointments.ts apply it for people and Block 5 applies it for the cadence.
 */

export const STATUSES = [
  "SCHEDULED",
  "CONFIRMED",
  "ARRIVED",
  "IN_PROGRESS",
  "COMPLETED",
  "NO_SHOW",
  "CANCELED_BY_PATIENT",
  "CANCELED_BY_PRACTICE",
  "RESCHEDULED",
] as const satisfies readonly AppointmentStatus[];

/** Atendido, Faltou and cancellations: they change only by correction (D-11). */
export const FINAL_STATUSES = ["COMPLETED", "NO_SHOW", "CANCELED_BY_PATIENT", "CANCELED_BY_PRACTICE"] as const satisfies readonly AppointmentStatus[];

/** Still waiting for someone to close it: "Sem baixa" once the day is over (D-13). */
export const OPEN_STATUSES = ["SCHEDULED", "CONFIRMED", "ARRIVED", "IN_PROGRESS"] as const satisfies readonly AppointmentStatus[];

/** Counted in "valor previsto": neither canceled nor rescheduled (D-13). */
export const PREDICTED_STATUSES = [...OPEN_STATUSES, "COMPLETED", "NO_SHOW"] as const satisfies readonly AppointmentStatus[];

/** Hold the professional's time: a new booking over them is a conflict (D-43). */
export const OCCUPYING_STATUSES = [...OPEN_STATUSES, "COMPLETED"] as const satisfies readonly AppointmentStatus[];

export const CANCELED_STATUSES = ["CANCELED_BY_PATIENT", "CANCELED_BY_PRACTICE"] as const satisfies readonly AppointmentStatus[];

/**
 * What a spreadsheet row can carry from the previous system (D-48). Chegou and Em
 * atendimento only make sense while the visit happens, and Reagendado has its own flow.
 */
export const IMPORTABLE_STATUSES = ["SCHEDULED", "CONFIRMED", ...FINAL_STATUSES] as const satisfies readonly AppointmentStatus[];

/**
 * A person acting with a practice role, the WhatsApp cadence answering for the
 * patient, the spreadsheet import recording the status the previous system had, the
 * acceptance of a change made in Google (D-63; who may accept is checked by the
 * service), or the secretary's confirmation made in SynkronosCRM (D-66).
 */
export type StatusActor =
  | { kind: "user"; role: AccessRole; ownsAppointment: boolean }
  | { kind: "cadence" }
  | { kind: "import" }
  | { kind: "google" }
  | { kind: "crm" };

type Rule = {
  from: readonly AppointmentStatus[];
  to: readonly AppointmentStatus[];
  permission: Permission;
  cadence?: boolean;
  /** An event deleted or moved in Google, once accepted (D-63). */
  google?: boolean;
  /** The secretary's command tag in SynkronosCRM (D-66). */
  crm?: boolean;
  correction?: boolean;
  rescheduleOnly?: boolean;
};

const RULES: readonly Rule[] = [
  { from: ["SCHEDULED"], to: ["CONFIRMED"], permission: "appointments:manage", cadence: true, crm: true },
  { from: ["SCHEDULED", "CONFIRMED"], to: ["ARRIVED"], permission: "appointments:mark-arrival" },
  { from: ["SCHEDULED", "CONFIRMED"], to: ["NO_SHOW"], permission: "appointments:manage" },
  { from: ["SCHEDULED", "CONFIRMED"], to: ["CANCELED_BY_PRACTICE"], permission: "appointments:manage", google: true },
  { from: ["SCHEDULED", "CONFIRMED"], to: ["CANCELED_BY_PATIENT"], permission: "appointments:manage", cadence: true },
  { from: ["SCHEDULED", "CONFIRMED"], to: ["RESCHEDULED"], permission: "appointments:manage", rescheduleOnly: true, google: true },
  { from: ["ARRIVED"], to: ["IN_PROGRESS", "COMPLETED"], permission: "appointments:attend" },
  { from: ["IN_PROGRESS"], to: ["COMPLETED"], permission: "appointments:attend" },
  { from: FINAL_STATUSES, to: FINAL_STATUSES, permission: "appointments:correct-final-status", correction: true },
];

export type TransitionCheck =
  | { ok: true; reasonRequired: boolean }
  | { ok: false; code: "invalid_transition" | "not_allowed" };

export function checkTransition(
  from: AppointmentStatus,
  to: AppointmentStatus,
  actor: StatusActor,
  options: { via?: "reschedule" } = {},
): TransitionCheck {
  // An imported appointment is created Agendado and set at once to the status of
  // the sheet: a fact of the previous system, not a step of this table (D-48).
  if (actor.kind === "import") {
    const importable = from === "SCHEDULED" && to !== from && (IMPORTABLE_STATUSES as readonly AppointmentStatus[]).includes(to);
    return importable && !options.via ? { ok: true, reasonRequired: false } : { ok: false, code: "invalid_transition" };
  }
  const rule = from === to ? undefined : RULES.find((candidate) => candidate.from.includes(from) && candidate.to.includes(to));
  if (!rule || Boolean(rule.rescheduleOnly) !== (options.via === "reschedule")) return { ok: false, code: "invalid_transition" };

  if (actor.kind === "cadence") return rule.cadence ? { ok: true, reasonRequired: false } : { ok: false, code: "not_allowed" };
  if (actor.kind === "google") return rule.google ? { ok: true, reasonRequired: false } : { ok: false, code: "not_allowed" };
  if (actor.kind === "crm") return rule.crm ? { ok: true, reasonRequired: false } : { ok: false, code: "not_allowed" };
  if (!can(actor.role, rule.permission)) return { ok: false, code: "not_allowed" };
  // Roles that see only their own agenda act only on their own appointments.
  if (!can(actor.role, "agenda:view") && !actor.ownsAppointment) return { ok: false, code: "not_allowed" };
  return { ok: true, reasonRequired: Boolean(rule.correction) };
}

/** Statuses the actor can set next, in table order. Reagendado has its own flow. */
export function nextStatuses(from: AppointmentStatus, actor: StatusActor): AppointmentStatus[] {
  return STATUSES.filter((to) => checkTransition(from, to, actor).ok);
}

export function isFinal(status: AppointmentStatus) {
  return (FINAL_STATUSES as readonly AppointmentStatus[]).includes(status);
}
