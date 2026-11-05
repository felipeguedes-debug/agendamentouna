import type {
  AppointmentCategory,
  AppointmentFlagType,
  AppointmentStatus,
  CadenceStepAction,
  ConsentChannel,
  DispatchStatus,
  LeadSource,
  StatusChangeSource,
  WhatsappInstanceStatus,
} from "@/generated/prisma/enums";
import type { AccessRole } from "@/lib/auth/permissions";

// Interface texts (pt-BR) for the enums in prisma/schema.prisma.

export const CATEGORY_LABELS: Record<AppointmentCategory, string> = {
  CONSULTATION: "Consulta",
  FOLLOW_UP: "Retorno",
  PROCEDURE: "Procedimento",
  EXAM: "Exame",
  TELECONSULTATION: "Teleconsulta",
  BLOCK: "Bloqueio",
};

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  ARRIVED: "Chegou",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Atendido",
  NO_SHOW: "Faltou",
  CANCELED_BY_PATIENT: "Cancelado pelo paciente",
  CANCELED_BY_PRACTICE: "Cancelado pelo consultório",
  RESCHEDULED: "Reagendado",
};

/** Who changed a status when no user did (the history shows the user's name otherwise). */
export const STATUS_SOURCE_LABELS: Record<StatusChangeSource, string> = {
  USER: "Usuário",
  CADENCE_REPLY: "Paciente, pelo WhatsApp",
  GOOGLE: "Google Agenda",
  CRM: "SynkronosCRM",
  IMPORT: "Importação",
  SYSTEM: "Sistema",
};

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  INSTAGRAM: "Instagram",
  REFERRAL: "Indicação",
  WEBSITE: "Site",
  OTHER: "Outro",
};

export const FLAG_LABELS: Record<AppointmentFlagType, string> = {
  RESCHEDULE_REQUESTED: "Pediu remarcação",
  REPLIED_WITHOUT_CONFIRMING: "Respondeu sem confirmar",
  NO_CONFIRMATION: "Sem confirmação",
  MANUAL_CONTACT: "Contato manual",
};

/** How the contact consent was collected (D-47). */
export const CONSENT_CHANNEL_LABELS: Record<ConsentChannel, string> = {
  IN_PERSON: "Presencial",
  PHONE: "Telefone",
  WHATSAPP: "WhatsApp",
  FORM: "Formulário",
  IMPORT: "Importação",
};

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  SCHEDULED: "Agendada",
  SENT: "Enviada",
  DELIVERED: "Entregue",
  READ: "Lida",
  FAILED: "Falhou",
  SKIPPED: "Pulada",
  CANCELED: "Cancelada",
};

export const INSTANCE_STATUS_LABELS: Record<WhatsappInstanceStatus, string> = {
  CONNECTED: "conectado",
  DISCONNECTED: "desconectado",
  PENDING_QR: "aguardando QR Code",
};

export const CADENCE_ACTION_LABELS: Record<CadenceStepAction, string> = {
  REQUEST_CONFIRMATION: "Pedir confirmação (1, 2 ou 3)",
  REMINDER: "Só lembrar",
};

/** Dispatch.statusReason codes (src/lib/cadence/plan.ts): why it moved, was skipped, canceled or failed. */
export const DISPATCH_REASON_LABELS: Record<string, string> = {
  anticipated: "antecipada para a janela de envio",
  postponed: "adiada para a janela de envio",
  rate_limited: "adiada pelo limite de 1 mensagem a cada 4 h",
  passed: "o horário já tinha passado ao agendar",
  outside_window: "fora da janela de envio, sem a margem antes do atendimento",
  rate_limit: "limite de 1 mensagem a cada 4 h, sem a margem antes do atendimento",
  confirmed: "agendamento confirmado",
  canceled: "agendamento cancelado",
  rescheduled: "agendamento remarcado",
  status_changed: "o status do agendamento mudou",
  manual_contact: "contato manual registrado",
  consent_revoked: "paciente revogou o consentimento",
  cadence_changed: "régua alterada",
  not_eligible: "status do agendamento fora dos elegíveis do passo",
  no_consent: "paciente sem consentimento",
  cadence_off: "régua desligada no agendamento",
  paused: "régua pausada: paciente respondeu com texto livre",
  appointment_passed: "o atendimento já passou",
  instance_disconnected: "instância desconectada",
  overdue: "atrasada mais de 2 h",
  no_instance: "profissional sem WhatsApp conectado",
  no_phone: "paciente sem celular",
  send_error: "erro no envio",
};

/** CrmInboundEvent.outcome codes (src/lib/crm/rules.ts): what came of a command from SynkronosCRM. */
export const CRM_OUTCOME_LABELS: Record<string, string> = {
  confirmed: "Confirmado",
  already_confirmed: "Já estava confirmado",
  manual_contact: "Contato manual registrado",
  unknown_contact: "Nenhum paciente com este celular",
  no_cadence_message: "Nenhuma mensagem de régua enviada ao paciente",
  appointment_passed: "O atendimento já passou",
  not_open: "Agendamento já encerrado",
};

/** CrmInboundEvent.command codes. */
export const CRM_COMMAND_LABELS: Record<string, string> = {
  confirm: "Confirmar",
  manual_contact: "Contato manual",
};

/** Name shown outside the system, in Google and in {tipo} (D-14). */
export function appointmentTypeDisplayName(type: { displayName: string | null; category: AppointmentCategory }) {
  return type.displayName ?? CATEGORY_LABELS[type.category];
}

export const ROLE_LABELS: Record<AccessRole, string> = {
  ORG_ADMIN: "Admin da organização",
  PRACTICE_MANAGER: "Gestor da conta",
  SECRETARY: "Secretária",
  PROFESSIONAL: "Profissional",
};
