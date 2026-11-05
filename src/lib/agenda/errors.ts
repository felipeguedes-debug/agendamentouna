/** Expected failures of the agenda (types, patients, appointments), with the text shown to the user. */

export const AGENDA_ERROR_TEXT = {
  not_allowed: "Você não tem permissão para isso nesta conta.",
  not_found: "Agendamento não encontrado.",
  block_not_found: "Bloqueio não encontrado. Bloqueio vindo do Google só muda no Google.",
  block_reason_required: "Informe o motivo do bloqueio.",
  invalid_block_time: "Confira o horário do bloqueio: o início precisa vir antes do fim.",
  professional_name_required: "Informe o nome do profissional.",
  professional_name_taken: "Já existe um profissional com esse nome nesta conta.",
  professional_location_required: "Escolha pelo menos uma unidade.",
  professional_last_location: "O profissional precisa de pelo menos uma unidade. Para tirá-lo da agenda, desative o cadastro.",
  professional_has_appointments: "Esse profissional tem agendamentos pela frente aqui. Remarque ou cancele antes.",
  instance_url_invalid: "Informe a URL da instância como aparece no painel da WhatsAPI, começando por https://.",
  instance_token_required: "Informe o token da instância.",
  instance_phone_invalid: "Informe o número conectado à instância, com DDD.",
  instance_token_refused: "A WhatsAPI recusou esse token. Confira a URL e o token no painel dela. Nada foi salvo.",
  instance_unreachable: "A WhatsAPI não respondeu nessa URL. Confira a URL e tente de novo. Nada foi salvo.",
  public_url_missing: "Este ambiente não tem endereço público para receber as respostas dos pacientes (PUBLIC_WEBHOOK_URL). Nada foi salvo.",
  location_name_required: "Informe o nome da unidade.",
  location_address_required: "Informe o endereço da unidade.",
  invalid_time_zone: "Escolha um fuso horário da lista.",
  last_location: "A conta precisa de pelo menos uma unidade ativa.",
  invalid_hours: "Confira o intervalo: o início precisa vir antes do fim.",
  overlapping_hours: "Esse intervalo cruza com outro do mesmo dia.",
  hours_unavailable: "Esse horário não existe mais. Atualize a página.",
  exception_reason_required: "Informe o motivo da exceção.",
  invalid_exception: "Confira as datas da exceção: o início não pode vir depois do fim.",
  exception_unavailable: "Essa exceção não existe mais. Atualize a página.",
  invalid_transition: "Essa mudança de status não é permitida.",
  reason_required: "Informe o motivo da correção.",
  status_changed: "O status mudou enquanto você editava. Atualize a página e tente de novo.",
  conflict: "Esse horário conflita com outro agendamento ou bloqueio do profissional.",
  invalid_date: "Informe uma data e uma hora válidas.",
  invalid_duration: "A duração precisa ser um número inteiro de 5 a 480 minutos.",
  invalid_price: "Informe um valor válido, como 450 ou 450,00.",
  invalid_text: "Algum campo passou do tamanho permitido.",
  professional_unavailable: "Profissional não encontrado ou inativo.",
  location_unavailable: "O profissional não atende nessa unidade.",
  type_unavailable: "Tipo de atendimento não encontrado ou inativo.",
  patient_unavailable: "Paciente não encontrado.",
  name_required: "Informe o nome do paciente.",
  invalid_phone: "Informe um celular válido, com DDD.",
  phone_taken: "Já existe um paciente com esse celular nesta conta.",
  type_name_required: "Informe o nome do tipo.",
  invalid_category: "Escolha uma categoria da lista.",
  invalid_color: "Escolha uma cor da paleta.",
  cadence_unavailable: "Régua não encontrada nesta conta.",
  invalid_status: "Esse status não pode ser importado.",
  future_final_status: "Agendamento futuro não pode estar Atendido nem Faltou.",
  invalid_channel: "Escolha como o consentimento foi coletado.",
  consent_unchanged: "O consentimento já está assim. Atualize a página.",
  confirmation_required: "Digite EXCLUIR para confirmar.",
  open_appointments: "Dê baixa ou cancele os agendamentos em aberto deste paciente antes de excluir os dados.",
  cadence_name_required: "Informe o nome da régua.",
  invalid_steps: "A régua precisa de 1 a 4 passos.",
  invalid_step_time: "Confira quando cada passo sai: de 1 a 30 dias antes, com horário, ou de 1 a 72 horas antes.",
  invalid_template: "Confira o texto dos passos.",
  confirmation_scheduled_only: "Pedido de confirmação vale só para quem está Agendado.",
  invalid_window: "Confira a janela de envio: início antes do fim, pelo menos um dia e margem de 0 a 12 horas.",
  no_consent: "O paciente não aceitou receber mensagens pelo WhatsApp.",
  no_instance: "O profissional não tem WhatsApp conectado nesta conta.",
  appointment_not_open: "Só agendamentos futuros, Agendados ou Confirmados, recebem mensagens.",
  step_unavailable: "Esse passo não está na régua deste agendamento.",
  invalid_email: "Informe um e-mail válido.",
  email_required: "O profissional não tem login: informe o e-mail para onde vai o link.",
  not_linked: "O profissional não tem Google Agenda vinculado.",
  already_resolved: "Essa pendência já foi resolvida ou mudou. Atualize a página.",
  crm_token_required: "Informe o token do FlwChat.",
  crm_token_refused: "O FlwChat recusou esse token. Confira em Ajustes > Integrações > Integração via API.",
  crm_unavailable: "O FlwChat não respondeu. Nada foi salvo; tente de novo em alguns minutos.",
  crm_not_connected: "Esta conta não está conectada à SynkronosCRM.",
  crm_no_public_url: "Este ambiente não tem endereço público para receber o webhook.",
} as const;

export type AgendaErrorCode = keyof typeof AGENDA_ERROR_TEXT;

export class AgendaError extends Error {
  override name = "AgendaError";
  /** Shown under the message, e.g. the bookings a new one conflicts with. */
  readonly details: string[];
  /** The existing patient when a phone is already registered. */
  readonly patient?: { id: string; name: string };

  constructor(
    readonly code: AgendaErrorCode,
    message: string,
    options: { details?: string[]; patient?: { id: string; name: string } } = {},
  ) {
    super(message);
    this.details = options.details ?? [];
    this.patient = options.patient;
  }
}
