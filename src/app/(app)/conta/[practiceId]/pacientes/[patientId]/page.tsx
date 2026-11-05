import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { formatDateBr, toZoned } from "@/lib/dates/zoned";
import { CONSENT_CHANNEL_LABELS } from "@/lib/domain/labels";
import { formatCents } from "@/lib/domain/money";
import { getPatientDetail } from "@/lib/patients/patients";
import { ConsentBadge } from "../_pacientes/consent-badge";
import { ConsentForm, ErasePatientForm, ExportPatientButton, PatientPhoneForm } from "../_pacientes/patient-forms";

export const metadata: Metadata = { title: "Paciente" };

function Card({ title, children, label }: { title: string; children: ReactNode; label: string }) {
  return (
    <section aria-labelledby={label} className="flex flex-col gap-3 rounded-xl border border-border bg-white px-5 py-4">
      <h2 id={label} className="text-sm font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** One patient: data, consent with its log, every appointment in the practice (PRD 4, rule 7) and the LGPD requests. */
export default async function PatientPage({ params }: PageProps<"/conta/[practiceId]/pacientes/[patientId]">) {
  const { practiceId, patientId } = await params;
  const context = await requirePracticePermission(practiceId, "patients:view");
  const [patient, logZone, crmConnections] = await Promise.all([getPatientDetail(context, patientId), agendaTimeZone(context.db), context.db.crmConnection.count()]);
  if (!patient) notFound();
  const crmConnected = crmConnections > 0;

  const { role } = context.access;
  const erased = patient.anonymizedAt !== null;
  // Appointments in their location's zone; the patient's own dates in the agenda's (D-41).
  const localDate = (instant: Date, timeZone: string) => formatDateBr(toZoned(instant, timeZone).date);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link href={`/conta/${practiceId}/pacientes`} className="text-sm font-medium text-primary hover:underline">
        ← Pacientes
      </Link>

      <header className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">{patient.name}</h1>
          {!erased ? (
            <p className="text-sm text-muted-foreground">
              {[patient.phone, patient.insurance].filter(Boolean).join(" · ")} · cadastrado em {localDate(patient.createdAt, logZone)}
            </p>
          ) : null}
        </div>
        {!erased ? <ConsentBadge state={patient.consent} className="ml-auto h-7 px-3 text-sm" /> : null}
      </header>

      {erased ? (
        <Alert>
          <AlertDescription>
            Dados pessoais excluídos em {localDate(patient.anonymizedAt!, logZone)} a pedido do titular. Os agendamentos continuam, sem dado pessoal, e a trilha de
            auditoria não muda.
          </AlertDescription>
        </Alert>
      ) : null}
      {patient.notes ? (
        <p className="rounded-lg bg-accent px-3 py-2 text-sm">
          <span className="font-semibold">Observações:</span> {patient.notes}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="agendamentos" className="flex min-w-0 flex-col gap-3">
          <h2 id="agendamentos" className="text-sm font-semibold">
            Agendamentos na conta · {patient.appointments.length}
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <Table className="min-w-[540px]">
              <TableHeader>
                <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
                  <TableHead className="px-4">Data</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patient.appointments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                      Nenhum agendamento.
                    </TableCell>
                  </TableRow>
                ) : null}
                {patient.appointments.map((appointment) => {
                  const start = toZoned(appointment.startsAt, appointment.location.timeZone);
                  return (
                    <TableRow key={appointment.id} data-testid="patient-appointment">
                      <TableCell className="px-4 py-3">
                        <Link href={`/conta/${practiceId}/agendamentos/${appointment.id}`} className="font-semibold text-primary tabular-nums hover:underline">
                          {formatDateBr(start.date)} {start.time}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{appointment.location.name}</span>
                      </TableCell>
                      <TableCell>{appointment.professionalName}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2">
                          <span className="size-2.5 rounded-full" style={{ background: appointment.typeColor }} />
                          {appointment.typeName}
                        </span>
                        {!appointment.cadenceEnabled ? <span className="block text-xs text-muted-foreground">Régua desligada (importado)</span> : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={appointment.status} />
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatCents(appointment.priceCents, { compact: true })}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          {!erased && can(role, "appointments:manage") ? (
            <Card title="Celular" label="celular">
              <PatientPhoneForm key={patient.phone} practiceId={practiceId} patientId={patient.id} phone={patient.phone} />
            </Card>
          ) : null}

          {!erased ? (
            <Card title="Consentimento de contato" label="consentimento">
              <p className="text-xs text-muted-foreground">
                Só quem aceita WhatsApp entra na régua de lembretes. Aceite, recusa e revogação ficam registrados com data e canal; o registro nunca é apagado.
              </p>
              {can(role, "patients:consent") ? <ConsentForm key={patient.consent} practiceId={practiceId} patientId={patient.id} state={patient.consent} /> : null}
            </Card>
          ) : null}

          <Card title="Histórico do consentimento" label="historico-consentimento">
            {patient.consentHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum registro.</p>
            ) : (
              <ol className="flex flex-col gap-2 text-sm" data-testid="consent-history">
                {patient.consentHistory.map((entry) => {
                  const at = toZoned(entry.recordedAt, logZone);
                  return (
                    <li key={entry.id} className="flex flex-col">
                      <span className="font-semibold">{entry.granted ? "Aceite" : "Recusa ou revogação"}</span>
                      <span className="text-xs text-muted-foreground">
                        {CONSENT_CHANNEL_LABELS[entry.channel]} · {formatDateBr(at.date)} {at.time}
                        {entry.recordedByName ? ` · ${entry.recordedByName}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {can(role, "patients:data-requests") ? (
            <Card title="Pedidos do titular (LGPD)" label="titular">
              <p className="text-xs text-muted-foreground">Atenda em até 15 dias. A exportação reúne cadastro, consentimentos e agendamentos desta conta.</p>
              <ExportPatientButton practiceId={practiceId} patientId={patient.id} />
              {!erased ? (
                <>
                  <p className="border-t border-[#EEF1F0] pt-3 text-xs text-muted-foreground">
                    A exclusão troca o nome por &quot;Paciente excluído&quot; e apaga celular, convênio, observações e os textos livres dos agendamentos. Os agendamentos
                    continuam, para os indicadores. Não dá para desfazer.
                  </p>
                  {crmConnected ? (
                    <p className="text-xs text-muted-foreground">
                      Na SynkronosCRM, a agenda apaga as notas e as etiquetas que escreveu. O contato e as conversas ficam lá, porque a API não os apaga: exclua-os na Synkronos.
                    </p>
                  ) : null}
                  <ErasePatientForm practiceId={practiceId} patientId={patient.id} />
                </>
              ) : null}
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
