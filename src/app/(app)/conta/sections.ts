import type { AccessRole, Permission } from "@/lib/auth/permissions";
import { can } from "@/lib/auth/permissions";

export const SETTINGS_GROUPS = ["Atendimento", "Equipe", "Consultório"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

type Section = {
  segment: string | null;
  label: string;
  permission: Permission | readonly Permission[] | null;
  /** Side menu, a group of Configurações, or the user's menu (D-81). */
  place: "main" | "settings" | "user";
  group?: SettingsGroup;
  description?: string;
};

/** Screens of a practice, in menu order, with the permission each page checks (any of a list). */
export const PRACTICE_SECTIONS: readonly Section[] = [
  // Every role has a view of the agenda (the professional, of their own).
  { segment: null, label: "Agenda", permission: ["agenda:view", "agenda:view-own"], place: "main" },
  // What waits for someone, in one list (D-84): the professional sees the Google rows of their own agenda.
  { segment: "pendencias", label: "Pendências", permission: ["agenda:view", "google-changes:resolve", "google-changes:resolve-own"], place: "main" },
  // The import page under it checks patients:import.
  { segment: "pacientes", label: "Pacientes", permission: "patients:view", place: "main" },
  // The panel of PRD 8 (D-74); the secretary's and the professional's numbers are on the agenda's panel.
  { segment: "indicadores", label: "Indicadores", permission: "reports:practice", place: "main" },
  {
    segment: "tipos",
    label: "Tipos de atendimento",
    permission: ["appointment-types:view", "appointment-types:view-own"],
    place: "settings",
    group: "Atendimento",
    description: "Duração, valor, cor, preparo e régua de cada tipo",
  },
  { segment: "regua", label: "Régua de WhatsApp", permission: "cadence:edit", place: "settings", group: "Atendimento", description: "Mensagens, janela de envio e canais dos profissionais" },
  // The professionals' Google link, for the manager (D-23); the page of each one is under it.
  { segment: "profissionais", label: "Profissionais", permission: "google:send-link", place: "settings", group: "Equipe", description: "Cadastro, unidades e Google Agenda de cada profissional" },
  { segment: "usuarios", label: "Usuários", permission: "users:invite", place: "settings", group: "Equipe", description: "Convites, papéis e desligamento" },
  // Locations, and under them each professional's working hours and days off (D-86).
  { segment: "unidades", label: "Unidades e horários", permission: "practice-settings:edit", place: "settings", group: "Consultório", description: "Endereços, fuso e horário de cada profissional" },
  // The practice's settings (D-23): the two-factor requirement (D-71) and the FlwChat token (D-68).
  { segment: "integracoes", label: "Segurança e integrações", permission: "practice-settings:edit", place: "settings", group: "Consultório", description: "Exigir 2FA e conexão com a SynkronosCRM" },
  // The internal panel of PRD 7 (D-101): whether the operation is working.
  { segment: "saude", label: "Saúde da operação", permission: "reports:practice", place: "settings", group: "Consultório", description: "Entrega do WhatsApp, falhas de sincronização e erros" },
  { segment: "auditoria", label: "Trilha de auditoria", permission: "audit:view", place: "settings", group: "Consultório", description: "Quem fez o quê nesta conta" },
  // The professional's own profile: their Google link and busy calendars.
  { segment: "perfil", label: "Meu perfil", permission: "google:link-own", place: "user" },
];

/** Pages that are not menu entries: new appointment and appointment detail, under the agenda. */
const AGENDA_SEGMENTS = ["agendamentos"];

/** The hub of the settings and the phone's "Mais" list: open to every role, each sees what it may. */
const HUB_SEGMENTS = ["configuracoes", "mais"];

function allowed(role: AccessRole, permission: Section["permission"]) {
  if (!permission) return true;
  const permissions: readonly Permission[] = typeof permission === "string" ? [permission] : permission;
  return permissions.some((candidate) => can(role, candidate));
}

export function visibleSections(role: AccessRole) {
  return PRACTICE_SECTIONS.filter((section) => allowed(role, section.permission));
}

export function mainSections(role: AccessRole) {
  return visibleSections(role).filter((section) => section.place === "main");
}

export function settingsGroups(role: AccessRole) {
  const sections = visibleSections(role).filter((section) => section.place === "settings");
  return SETTINGS_GROUPS.map((group) => ({ group, sections: sections.filter((section) => section.group === group) })).filter((entry) => entry.sections.length > 0);
}

/** The menu entry a route segment belongs to. */
export function activeSegment(segment: string | null) {
  return segment && AGENDA_SEGMENTS.includes(segment) ? null : segment;
}

/** The side menu lights up Configurações on the hub and on every screen under it. */
export function isSettingsSegment(segment: string | null) {
  return segment === "configuracoes" || PRACTICE_SECTIONS.some((section) => section.place === "settings" && section.segment === segment);
}

export function practicePath(practiceId: string, segment?: string | null) {
  return segment ? `/conta/${practiceId}/${segment}` : `/conta/${practiceId}`;
}

/** The same screen in another practice when the role there allows it, else its agenda. */
export function samePlaceIn(practiceId: string, role: AccessRole, segment: string | null) {
  const active = activeSegment(segment);
  if (active && HUB_SEGMENTS.includes(active)) return practicePath(practiceId, active);
  const section = visibleSections(role).find((candidate) => candidate.segment === active);
  return practicePath(practiceId, section?.segment);
}
