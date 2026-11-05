/**
 * Failures of the spreadsheet import (D-48), with the text shown to the user. A
 * file error stops the import before anything is written; a row error goes to
 * the report and the other rows go on.
 */

export const MAX_FILE_BYTES = 900 * 1024;
export const MAX_PATIENT_ROWS = 20_000;
export const MAX_AGENDA_ROWS = 2_000;

export const IMPORT_FILE_ERROR_TEXT = {
  empty: "A planilha está vazia: falta o cabeçalho ou as linhas.",
  too_large: "O arquivo passa de 900 KB. Divida a planilha em partes menores.",
  too_many_rows: "A planilha tem linhas demais para uma importação. Divida em partes menores.",
  missing_columns: "Faltam colunas obrigatórias no cabeçalho:",
  unclosed_quote: "Há uma aspa sem fechamento na planilha, a partir da linha",
} as const;

export type ImportFileErrorCode = keyof typeof IMPORT_FILE_ERROR_TEXT;

export class ImportFileError extends Error {
  override name = "ImportFileError";

  constructor(
    readonly code: ImportFileErrorCode,
    readonly detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export function importFileErrorText(error: ImportFileError) {
  const text = IMPORT_FILE_ERROR_TEXT[error.code];
  return error.detail ? `${text} ${error.detail}.` : text;
}

/** Row messages of the report. */
export const ROW_ERROR = {
  nameRequired: "Informe o nome.",
  patientNameRequired: "Informe o nome do paciente.",
  phoneRequired: "Informe o celular.",
  invalidPhone: "Celular inválido: informe o DDD e o número.",
  duplicatePhone: (line: number) => `Celular repetido na planilha (linha ${line}).`,
  invalidConsent: "Consentimento de WhatsApp deve ser sim, não ou vazio.",
  textTooLong: (column: string) => `Texto longo demais na coluna ${column}.`,
  dateRequired: "Informe a data.",
  invalidDate: (value: string) => `Data inválida: ${value}. Use dd/mm/aaaa.`,
  timeRequired: "Informe a hora.",
  invalidTime: (value: string) => `Hora inválida: ${value}. Use hh:mm.`,
  professionalRequired: "Informe o profissional.",
  unknownProfessional: (value: string) => `Profissional não encontrado: ${value}.`,
  ambiguousProfessional: (value: string) => `Há mais de um profissional com o nome ${value}.`,
  locationRequired: (professional: string) => `Informe a unidade: ${professional} atende em mais de uma.`,
  noLocation: (professional: string) => `${professional} não tem unidade ativa.`,
  unknownLocation: (value: string) => `Unidade não encontrada: ${value}.`,
  locationNotServed: (professional: string, location: string) => `${professional} não atende na ${location}.`,
  typeRequired: "Informe o tipo de atendimento.",
  unknownType: (value: string) => `Tipo de atendimento não encontrado: ${value}.`,
  inactiveType: (value: string) => `Tipo de atendimento inativo: ${value}.`,
  invalidStatus: (value: string) =>
    `Status não importável: ${value}. Use Agendado, Confirmado, Atendido, Faltou, Cancelado pelo paciente ou Cancelado pelo consultório.`,
  futureFinalStatus: "Agendamento futuro não pode estar Atendido nem Faltou.",
  invalidDuration: (value: string) => `Duração inválida: ${value}. Use minutos, de 5 a 480.`,
  invalidPrice: (value: string) => `Valor inválido: ${value}. Use 450 ou 450,00.`,
  invalidLeadSource: (value: string) => `Origem inválida: ${value}. Use Instagram, Indicação, Site ou Outro.`,
  conflict: (details: string[]) => `Conflito de horário com: ${details.join("; ")}.`,
} as const;
