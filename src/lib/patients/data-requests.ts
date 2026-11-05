import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { AgendaError } from "@/lib/agenda/errors";
import { OPEN_STATUSES } from "@/lib/appointments/status";
import { formatDateBr, toZoned, todayIn } from "@/lib/dates/zoned";
import {
  CATEGORY_LABELS,
  CONSENT_CHANNEL_LABELS,
  DISPATCH_STATUS_LABELS,
  LEAD_SOURCE_LABELS,
  STATUS_LABELS,
  STATUS_SOURCE_LABELS,
} from "@/lib/domain/labels";
import { formatCents } from "@/lib/domain/money";
import { requestCrmSync } from "@/lib/crm/queue";
import { markForGoogleSync, requestGoogleSync } from "@/lib/google/queue";
import { formatPhone } from "./phone";

/**
 * Requests of the data subject (PRD 7 LGPD; D-28, D-49), handled by the manager.
 *
 * - Export: everything the practice holds about the patient, as JSON in
 *   Portuguese. The internal note goes too: the right of access covers every
 *   piece of personal data; "não vai para o paciente" (PRD 4) is about messages
 *   and Google. Names of staff who changed a status stay out: they are the
 *   staff's data, not the patient's.
 * - Erasure: pseudonymization. The patient becomes "Paciente excluído" without
 *   phone, insurance or notes; the appointments stay for the indicators, without
 *   the free texts that may carry personal data; consent rows and the audit trail
 *   stay as they are, since they hold ids and field names only. The patient's
 *   events in Google are marked for export, which writes them without the first
 *   name (D-62). In SynkronosCRM the export takes back what the agenda wrote, notes
 *   and tags; the contact and its conversations stay there, and the manager is told,
 *   since the API cannot delete a contact (D-68).
 */

export const ERASED_PATIENT_NAME = "Paciente excluído";
export const ERASE_CONFIRMATION = "EXCLUIR";

/** Fields the erasure clears, as recorded in the audit event. */
const ERASED_FIELDS = [
  "name",
  "phone",
  "insurance",
  "notes",
  "appointments.insurance",
  "appointments.internalNote",
  "statusChanges.reason",
  "dispatches.messageText",
  "dispatches.replyText",
  // Copies the sandbox messaging provider kept (Block 5); empty in production.
  "sandboxMessages.toPhone",
  "sandboxMessages.text",
  // The link to the contact in SynkronosCRM, and the log's copy of it (D-68).
  "crmContactId",
  "crmInboundEvents.externalContactId",
];

function assertCanHandle({ access }: PracticeContext) {
  if (!can(access.role, "patients:data-requests")) throw new AgendaError("not_allowed", "Only the manager handles data requests");
}

const iso = (date: Date | null) => date?.toISOString() ?? null;

export type PatientExport = Awaited<ReturnType<typeof exportPatientData>>["data"];

export async function exportPatientData(context: PracticeContext, patientId: string, now = new Date()) {
  assertCanHandle(context);
  const { user, access, db } = context;
  const patient = isUuid(patientId) ? await db.patient.findFirst({ where: { id: patientId } }) : null;
  if (!patient) throw new AgendaError("patient_unavailable", "Patient not found");

  const [consents, appointments, timeZone] = await Promise.all([
    db.contactConsent.findMany({ where: { patientId: patient.id }, orderBy: [{ recordedAt: "asc" }, { id: "asc" }] }),
    db.appointment.findMany({
      where: { patientId: patient.id },
      orderBy: { startsAt: "desc" },
      include: {
        location: { select: { name: true, address: true, timeZone: true } },
        professional: { select: { name: true } },
        appointmentType: { select: { name: true, category: true } },
        statusChanges: { orderBy: { changedAt: "asc" } },
        dispatches: { orderBy: { scheduledFor: "asc" } },
      },
    }),
    agendaTimeZone(db),
  ]);

  const data = {
    geradoEm: now.toISOString(),
    conta: access.practiceName,
    paciente: {
      id: patient.id,
      nome: patient.name,
      celular: formatPhone(patient.phone) || null,
      convenio: patient.insurance,
      observacoes: patient.notes,
      contatoNaSynkronos: patient.crmContactId,
      cadastradoEm: patient.createdAt.toISOString(),
      excluidoEm: iso(patient.anonymizedAt),
    },
    consentimentos: consents.map((consent) => ({
      registradoEm: consent.recordedAt.toISOString(),
      situacao: consent.granted ? "Aceita" : "Não aceita",
      canal: CONSENT_CHANNEL_LABELS[consent.channel],
    })),
    agendamentos: appointments.map((appointment) => {
      const start = toZoned(appointment.startsAt, appointment.location.timeZone);
      return {
        id: appointment.id,
        inicio: appointment.startsAt.toISOString(),
        data: formatDateBr(start.date),
        hora: start.time,
        fusoHorario: appointment.location.timeZone,
        unidade: appointment.location.name,
        endereco: appointment.location.address,
        profissional: appointment.professional.name,
        tipo: appointment.appointmentType.name,
        categoria: CATEGORY_LABELS[appointment.appointmentType.category],
        status: STATUS_LABELS[appointment.status],
        duracaoMinutos: appointment.durationMinutes,
        valor: formatCents(appointment.priceCents),
        convenio: appointment.insurance,
        origem: appointment.leadSource ? LEAD_SOURCE_LABELS[appointment.leadSource] : null,
        observacaoInterna: appointment.internalNote,
        remarcadoDe: appointment.rescheduledFromId,
        notasNaSynkronos: appointment.crmNoteIds,
        historico: appointment.statusChanges.map((change) => ({
          em: change.changedAt.toISOString(),
          de: change.fromStatus ? STATUS_LABELS[change.fromStatus] : null,
          para: STATUS_LABELS[change.toStatus],
          origem: STATUS_SOURCE_LABELS[change.source],
          motivo: change.reason,
        })),
        mensagens: appointment.dispatches.map((dispatch) => ({
          agendadaPara: dispatch.scheduledFor.toISOString(),
          enviadaEm: iso(dispatch.sentAt),
          situacao: DISPATCH_STATUS_LABELS[dispatch.status],
          texto: dispatch.messageText,
          resposta: dispatch.replyText,
          respondidaEm: iso(dispatch.repliedAt),
        })),
      };
    }),
  };

  await db.auditEvent.create({
    data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "patient.exported", entityType: "Patient", entityId: patient.id, changedFields: [] },
  });
  return { filename: `dados-paciente-${patient.id.slice(0, 8)}-${todayIn(timeZone, now)}.json`, data };
}

/**
 * Erasure at the data subject's request (D-28). Waits until no appointment is
 * open (Agendado, Confirmado, Chegou, Em atendimento, past ones included): the
 * office would not know whom to expect.
 */
export async function erasePatient(context: PracticeContext, input: { patientId: string; confirmation: string }, now = new Date()) {
  assertCanHandle(context);
  if (input.confirmation.trim().toUpperCase() !== ERASE_CONFIRMATION) throw new AgendaError("confirmation_required", "Type the confirmation");
  const { user, access, db } = context;
  const patient = isUuid(input.patientId) ? await db.patient.findFirst({ where: { id: input.patientId, anonymizedAt: null }, select: { id: true, crmContactId: true } }) : null;
  if (!patient) throw new AgendaError("patient_unavailable", "Patient not found or already erased");

  const withEvents = await db.$transaction(async (tx) => {
    const open = await tx.appointment.count({ where: { patientId: patient.id, status: { in: [...OPEN_STATUSES] } } });
    if (open > 0) throw new AgendaError("open_appointments", "The patient has open appointments");
    // The export needs the contact to take back the notes and tags, then forgets it.
    const inCrm = patient.crmContactId !== null && (await tx.crmConnection.count()) > 0;
    const { count } = await tx.patient.updateMany({
      where: { id: patient.id, anonymizedAt: null },
      data: {
        name: ERASED_PATIENT_NAME,
        phone: null,
        insurance: null,
        notes: null,
        anonymizedAt: now,
        crmSyncRequestedAt: null,
        crmSyncRetryAt: null,
        crmSyncAttempts: 0,
        crmSyncError: null,
        crmContactId: inCrm ? patient.crmContactId : null,
        crmEraseRequestedAt: inCrm ? now : null,
      },
    });
    if (count === 0) throw new AgendaError("patient_unavailable", "Erased concurrently");
    const appointmentIds = (await tx.appointment.findMany({ where: { patientId: patient.id }, select: { id: true } })).map((row) => row.id);
    await tx.appointment.updateMany({ where: { patientId: patient.id }, data: { insurance: null, internalNote: null, crmSyncRequestedAt: null, crmSyncRetryAt: null, ...(inCrm ? {} : { crmNoteIds: [] }) } });
    await tx.crmInboundEvent.updateMany({ where: { patientId: patient.id }, data: { externalContactId: null } });
    await tx.appointmentStatusChange.updateMany({ where: { appointmentId: { in: appointmentIds } }, data: { reason: null } });
    await tx.dispatch.updateMany({ where: { appointmentId: { in: appointmentIds } }, data: { messageText: null, replyText: null } });
    await tx.sandboxMessage.updateMany({ where: { dispatch: { is: { appointmentId: { in: appointmentIds } } } }, data: { toPhone: null, text: null } });
    await tx.auditEvent.create({
      data: {
        practiceId: access.practiceId,
        actorType: "USER",
        actorUserId: user.id,
        action: "patient.anonymized",
        entityType: "Patient",
        entityId: patient.id,
        changedFields: ERASED_FIELDS,
      },
    });
    // Their Google events lose the first name at the next export (D-28).
    const events = (await tx.appointment.findMany({ where: { patientId: patient.id, googleEventId: { not: null } }, select: { id: true } })).map((row) => row.id);
    await markForGoogleSync(tx, events, now);
    return events;
  });
  await requestGoogleSync(access.practiceId, withEvents, db);
  await requestCrmSync(access.practiceId, db);
}
