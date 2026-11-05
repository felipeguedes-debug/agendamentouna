/**
 * The audit trail in Portuguese (D-87). Pure: the events keep codes and field names
 * (D-28), and the screen reads them through these tables. A new action needs a label:
 * `labels.test.ts` scans the code for them.
 */

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "appointment.created": "Criou um agendamento",
  "appointment.imported": "Importou um agendamento",
  "appointment.status_changed": "Mudou o status do agendamento",
  "appointment.flagged": "Marcou o agendamento pela resposta do paciente",
  "appointment.manual_contact": "Registrou contato manual",
  "appointment.cadence_enabled": "Ligou a régua do agendamento",
  "appointment.cadence_resumed": "Retomou a régua do agendamento",
  "time_block.created": "Criou um bloqueio",
  "time_block.updated": "Alterou um bloqueio",
  "time_block.removed": "Removeu um bloqueio",
  "google_change.detected": "Mudança encontrada no Google",
  "google_change.reverted": "Reverteu a mudança do Google",
  "patient.created": "Cadastrou um paciente",
  "patient.imported": "Importou um paciente",
  "patient.updated": "Alterou o paciente",
  "patient.exported": "Exportou os dados do paciente",
  "patient.anonymized": "Excluiu os dados a pedido",
  "contact_consent.recorded": "Registrou o consentimento",
  "appointment_type.created": "Criou um tipo de atendimento",
  "appointment_type.updated": "Alterou o tipo de atendimento",
  "appointment_type.deactivated": "Desativou o tipo de atendimento",
  "appointment_type.reactivated": "Reativou o tipo de atendimento",
  "cadence.created": "Criou uma régua",
  "cadence.updated": "Alterou a régua",
  "dispatch.manual": "Enviou uma mensagem manual",
  "practice.send_window_updated": "Alterou a janela de envio",
  "practice.two_factor_required": "Passou a exigir 2FA na conta",
  "practice.two_factor_not_required": "Deixou de exigir 2FA na conta",
  "practice.created": "Criou a conta",
  "organization_admin.added": "Passou a administrar a organização",
  "invitation.created": "Convidou um usuário",
  "invitation.revoked": "Cancelou um convite",
  "invitation.accepted": "Aceitou um convite",
  "membership.revoked": "Desligou um usuário",
  "professional.created": "Cadastrou um profissional",
  "professional.updated": "Alterou o profissional",
  "professional.location_linked": "Ligou o profissional a uma unidade",
  "professional.location_unlinked": "Desligou o profissional de uma unidade",
  "professional.deactivated": "Desativou o profissional",
  "professional.reactivated": "Reativou o profissional",
  "professional.google_linked": "Vinculou o Google Agenda",
  "professional.google_unlinked": "Desvinculou o Google Agenda",
  "professional.google_busy_calendars": "Mudou os calendários que contam como ocupado",
  "professional.google_all_day_rule": "Mudou a regra de evento de dia inteiro",
  "google_link.sent": "Enviou o link de vínculo do Google",
  "whatsapp_instance.registered": "Registrou a instância de WhatsApp",
  "whatsapp_instance.updated": "Alterou a instância de WhatsApp",
  "crm.connected": "Conectou a SynkronosCRM",
  "crm.disconnected": "Desconectou a SynkronosCRM",
  "crm.webhook_registered": "Registrou o webhook da SynkronosCRM",
  "location.created": "Criou uma unidade",
  "location.updated": "Alterou a unidade",
  "location.deactivated": "Desativou a unidade",
  "location.reactivated": "Reativou a unidade",
  "working_hours.created": "Adicionou um horário de atendimento",
  "working_hours.updated": "Alterou um horário de atendimento",
  "working_hours.removed": "Removeu um horário de atendimento",
  "schedule_exception.created": "Adicionou uma exceção de horário",
  "schedule_exception.removed": "Removeu uma exceção de horário",
};

export function auditActionLabel(action: string) {
  return AUDIT_ACTION_LABELS[action] ?? "Alteração registrada";
}

const FIELD_LABELS: Record<string, string> = {
  active: "situação",
  address: "endereço",
  apiUrl: "URL da instância",
  allDayEventsBlock: "regra de dia inteiro",
  cadenceEnabled: "régua",
  channel: "canal",
  crmAccountId: "conta da Synkronos",
  defaultPriceCents: "valor",
  durationMinutes: "duração",
  endsAt: "fim",
  endTime: "fim",
  flags: "marcadores",
  googleBusyCalendarIds: "calendários",
  googleConnectionId: "vínculo",
  granted: "aceite",
  insurance: "convênio",
  locationId: "unidade",
  name: "nome",
  notes: "observações",
  phone: "celular",
  phoneNumber: "número",
  priceCents: "valor",
  professionalId: "profissional",
  reason: "motivo",
  requireTwoFactor: "exigir 2FA",
  revokedAt: "desligamento",
  role: "papel",
  startsAt: "início",
  startsOn: "início",
  endsOn: "fim",
  startTime: "início",
  status: "status",
  subscriptionId: "webhook",
  timeZone: "fuso",
  token: "token",
  weekday: "dia da semana",
};

/** Field names only, never a value (D-28). */
export function auditFieldsLabel(fields: readonly string[]) {
  return [...new Set(fields.map((field) => FIELD_LABELS[field] ?? field))].join(", ");
}

export const AUDIT_AREAS = ["agenda", "pacientes", "regua", "tipos", "usuarios", "integracoes", "consultorio"] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

export const AUDIT_AREA_LABELS: Record<AuditArea, string> = {
  agenda: "Agenda",
  pacientes: "Pacientes",
  regua: "Régua",
  tipos: "Tipos de atendimento",
  usuarios: "Usuários e profissionais",
  integracoes: "Integrações",
  consultorio: "Unidades e horários",
};

export const AUDIT_AREA_PREFIXES: Record<AuditArea, readonly string[]> = {
  agenda: ["appointment.", "time_block.", "google_change."],
  pacientes: ["patient.", "contact_consent."],
  regua: ["cadence.", "dispatch.", "practice.send_window"],
  tipos: ["appointment_type."],
  usuarios: ["invitation.", "membership.", "organization_admin.", "professional.created", "professional.updated", "professional.location", "professional.deactivated", "professional.reactivated"],
  integracoes: ["whatsapp_instance.", "crm.", "google_link.", "professional.google", "practice.two_factor"],
  consultorio: ["practice.created", "location.", "working_hours.", "schedule_exception."],
};

export const AUDIT_PERIODS = ["7d", "hoje", "30d", "tudo"] as const;
export type AuditPeriod = (typeof AUDIT_PERIODS)[number];

export const AUDIT_PERIOD_LABELS: Record<AuditPeriod, string> = {
  "7d": "Últimos 7 dias",
  hoje: "Hoje",
  "30d": "Últimos 30 dias",
  tudo: "Todo o período",
};
