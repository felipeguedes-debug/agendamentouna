import type { Role } from "@/generated/prisma/enums";

/**
 * Role permissions per practice, from the "Papéis por conta" table of PRD section 3
 * (D-40). "-own" permissions cover only the professional's own agenda and patients;
 * the screens that use them filter by the user's Professional record.
 */

/** The practice role plus the organization admin, who reaches every practice of the organization. */
export type AccessRole = "ORG_ADMIN" | Role;

export const ACCESS_ROLES = ["ORG_ADMIN", "PRACTICE_MANAGER", "SECRETARY", "PROFESSIONAL"] as const satisfies readonly AccessRole[];

export const PERMISSIONS = [
  // Agenda
  "agenda:view",
  "agenda:view-own",
  "appointments:manage",
  "appointments:mark-arrival",
  // Section 4: Chegou → Em atendimento → Atendido (D-44) and the overlapping
  // booking the manager may release (rule 3, D-43).
  "appointments:attend",
  "appointments:overbook",
  "appointments:correct-final-status",
  "appointments:edit-price",
  "time-blocks:manage",
  "time-blocks:manage-own",
  "google-changes:resolve",
  "google-changes:resolve-own",
  // Pacientes (Block 4, D-47 to D-50): list and consent with those who book; the
  // spreadsheet import and the data subject's export and erasure with the manager.
  "patients:view",
  "patients:consent",
  "patients:import",
  "patients:data-requests",
  // Tipos e valores
  "appointment-types:view",
  "appointment-types:view-own",
  "appointment-types:edit",
  // Régua de WhatsApp
  "cadence:edit",
  "cadence:templates",
  "dispatch:manual",
  "dispatch-log:view",
  "dispatch-log:view-own",
  // Usuários e Google Agenda
  "users:invite",
  "users:manage",
  "google:send-link",
  "google:link-own",
  // Relatórios
  "reports:consolidated",
  "reports:practice",
  "reports:day-week",
  "reports:own",
  // Not in the table (D-40): account settings (D-23) and the audit trail (PRD 3, req. 4).
  "practice-settings:edit",
  "audit:view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const SECRETARY: readonly Permission[] = [
  "agenda:view",
  "appointments:manage",
  "appointments:mark-arrival",
  "appointments:attend",
  "time-blocks:manage",
  "google-changes:resolve",
  "patients:view",
  "patients:consent",
  "appointment-types:view",
  "dispatch:manual",
  "dispatch-log:view",
  "reports:day-week",
];

const PRACTICE_MANAGER: readonly Permission[] = [
  ...SECRETARY,
  "appointments:overbook",
  "appointments:correct-final-status",
  "appointments:edit-price",
  "patients:import",
  "patients:data-requests",
  "appointment-types:edit",
  "cadence:edit",
  "users:invite",
  "google:send-link",
  "reports:practice",
  "practice-settings:edit",
  "audit:view",
];

const PROFESSIONAL: readonly Permission[] = [
  "agenda:view-own",
  "appointments:mark-arrival",
  "appointments:attend",
  "time-blocks:manage-own",
  "google-changes:resolve-own",
  "appointment-types:view-own",
  "dispatch-log:view-own",
  "google:link-own",
  "reports:own",
];

const ROLE_PERMISSIONS: Record<AccessRole, ReadonlySet<Permission>> = {
  ORG_ADMIN: new Set([...PRACTICE_MANAGER, "cadence:templates", "users:manage", "reports:consolidated"]),
  PRACTICE_MANAGER: new Set(PRACTICE_MANAGER),
  SECRETARY: new Set(SECRETARY),
  PROFESSIONAL: new Set(PROFESSIONAL),
};

export function can(role: AccessRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].has(permission);
}

/** Practice roles a user may invite: the manager invites secretaries, the admin anyone. */
export function invitableRoles(role: AccessRole): Role[] {
  if (role === "ORG_ADMIN") return ["PRACTICE_MANAGER", "SECRETARY", "PROFESSIONAL"];
  if (role === "PRACTICE_MANAGER") return ["SECRETARY"];
  return [];
}
