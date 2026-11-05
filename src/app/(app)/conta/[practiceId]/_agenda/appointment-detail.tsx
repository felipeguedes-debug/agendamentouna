import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/status-badge";
import { PanelClose, UrlPanel } from "@/components/url-panel";
import { APPOINTMENT_TABS, type AppointmentTab } from "@/lib/agenda/params";
import { getAppointmentDetail } from "@/lib/appointments/appointments";
import { checkTransition, isFinal, nextStatuses, type StatusActor } from "@/lib/appointments/status";
import type { PracticeContext } from "@/lib/auth/access";
import { can, type AccessRole } from "@/lib/auth/permissions";
import { getDispatchLog, type CadenceSituation } from "@/lib/cadence/worklist";
import { formatDateBr, formatLongDate, formatTime, toZoned } from "@/lib/dates/zoned";
import {
  appointmentTypeDisplayName,
  CATEGORY_LABELS,
  DISPATCH_REASON_LABELS,
  DISPATCH_STATUS_LABELS,
  FLAG_LABELS,
  LEAD_SOURCE_LABELS,
  STATUS_LABELS,
} from "@/lib/domain/labels";
import { formatCents } from "@/lib/domain/money";
import { googleChangeOf } from "@/lib/google/changes";
import { cn } from "@/lib/utils";
import { StatusActions } from "../agendamentos/[appointmentId]/appointment-actions";
import { CadenceActions } from "../agendamentos/[appointmentId]/cadence-actions";
import { GoogleChangeActions } from "../pendencias/_pendencias/change-actions";

const SITUATION_TEXT: Record<CadenceSituation, string> = {
  active: "Régua ativa.",
  off: "Régua desligada: agendamento importado. O gestor liga em Pacientes › Importar planilha.",
  no_consent: "Paciente sem consentimento de contato pelo WhatsApp: a régua não envia nada.",
  no_cadence: "O tipo não tem régua ativa para este profissional.",
  no_instance: "O profissional não tem WhatsApp conectado nesta conta: as mensagens não saem.",
  paused: "Régua pausada: o paciente respondeu com texto livre. Responda pela SynkronosCRM e retome a régua.",
  closed: "Agendamento encerrado ou já passou: nada mais é enviado.",
};

const DISPATCH_BADGE: Record<string, string> = {
  SCHEDULED: "bg-[#EEF1F0] text-[#3A4542]",
  SENT: "bg-[#E6F4F1] text-[#0F766E]",
  DELIVERED: "bg-[#E6F4F1] text-[#0F766E]",
  READ: "bg-[#DCFCE7] text-[#15803D]",
  FAILED: "bg-[#FDECEC] text-[#B91C1C]",
  SKIPPED: "bg-[#FEF3E2] text-[#B45309]",
  CANCELED: "bg-[#EEF1F0] text-[#5B6663]",
};

const TAB_LABELS: Record<AppointmentTab, string> = { resumo: "Resumo", mensagens: "Mensagens", historico: "Histórico" };

/** What the detail needs, read before anything is sent: a missing appointment answers 404 (D-72). */
export async function loadAppointmentView(context: PracticeContext, appointmentId: string) {
  const { access, db } = context;
  const appointment = await getAppointmentDetail(context, appointmentId);
  if (!appointment) return null;
  const actor: StatusActor = { kind: "user", role: access.role, ownsAppointment: appointment.ownsAppointment };
  const canReschedule = checkTransition(appointment.status, "RESCHEDULED", actor, { via: "reschedule" }).ok;
  const [professionals, log, googleChange] = await Promise.all([
    canReschedule
      ? db.professional.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, locations: { where: { location: { active: true } }, select: { location: { select: { id: true, name: true } } } } },
        })
      : [],
    getDispatchLog(context, appointment.id),
    googleChangeOf(context, appointment.id),
  ]);
  return {
    appointment,
    next: nextStatuses(appointment.status, actor),
    canReschedule,
    professionals: professionals.map((professional) => ({ id: professional.id, name: professional.name, locations: professional.locations.map((row) => row.location) })),
    log,
    googleChange,
    noConfirmation: appointment.status === "SCHEDULED" && appointment.flags.includes("NO_CONFIRMATION"),
  };
}

export type AppointmentView = NonNullable<Awaited<ReturnType<typeof loadAppointmentView>>>;

function moment(instant: Date, timeZone: string) {
  const local = toZoned(instant, timeZone);
  return `${formatDateBr(local.date)} ${local.time}`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2.5 py-1.5 text-[13.5px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1">
      <h2 className="text-xs font-semibold text-muted-foreground">{title}</h2>
      <dl>{children}</dl>
    </section>
  );
}

/** Name, time, what to do next and the tabs (D-83). */
export function AppointmentHeading({
  practiceId,
  view,
  role,
  tab,
  tabHref,
  closeHref,
  inPanel,
}: {
  practiceId: string;
  view: AppointmentView;
  role: AccessRole;
  tab: AppointmentTab;
  tabHref: (tab: AppointmentTab) => string;
  closeHref?: string;
  inPanel: boolean;
}) {
  const { appointment, googleChange, log } = view;
  const timeZone = appointment.location.timeZone;
  const start = toZoned(appointment.startsAt, timeZone);
  const Name = inPanel ? "p" : "h1";
  const lastSent = log?.entries.findLast((entry) => entry.sentAt)?.sentAt ?? null;
  const counts: Partial<Record<AppointmentTab, number>> = { mensagens: log?.entries.length, historico: appointment.history.length };
  const tabs = APPOINTMENT_TABS.filter((option) => option !== "mensagens" || log);

  return (
    <div className="flex flex-col gap-3 px-5 pt-5">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Name className="text-lg font-semibold">{appointment.patient.name}</Name>
          <p className="text-[13px] text-muted-foreground">
            {formatLongDate(start.date)}, {start.time} às {formatTime(appointment.endsAt, timeZone)} · {appointment.professional.name}
          </p>
        </div>
        {closeHref ? <PanelClose href={closeHref} /> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={appointment.status} noConfirmation={view.noConfirmation} />
        {view.noConfirmation && lastSent ? <span className="text-[13px] text-[#3A4542]">Último pedido em {moment(lastSent, timeZone)}, sem resposta.</span> : null}
      </div>

      {appointment.rescheduledFrom ? (
        <p className="rounded-lg bg-accent px-3 py-2 text-[13px]">
          Remarcado de{" "}
          <Link href={`/conta/${practiceId}/agendamentos/${appointment.rescheduledFrom.id}`} className="font-semibold text-primary hover:underline">
            {formatDateBr(toZoned(appointment.rescheduledFrom.startsAt, timeZone).date)} às {formatTime(appointment.rescheduledFrom.startsAt, timeZone)}
          </Link>
          .
        </p>
      ) : null}
      {appointment.rescheduledTo.map((target) => (
        <p key={target.id} className="rounded-lg bg-accent px-3 py-2 text-[13px]">
          Remarcado para{" "}
          <Link href={`/conta/${practiceId}/agendamentos/${target.id}`} className="font-semibold text-primary hover:underline">
            {formatDateBr(toZoned(target.startsAt, timeZone).date)} às {formatTime(target.startsAt, timeZone)}
          </Link>{" "}
          ({STATUS_LABELS[target.status]}).
        </p>
      ))}

      {googleChange ? (
        // PRD 5, rule 3: a change made in Google waits for accept or revert.
        <section aria-labelledby="google-pendencia" className="flex flex-col gap-2.5 rounded-xl border border-[#FCD9A6] bg-[#FEF3E2] px-3.5 py-3 text-[#92400E]">
          <h2 id="google-pendencia" className="text-sm font-semibold">
            Alteração no Google Agenda
          </h2>
          <p className="text-[13px]">
            {googleChange.kind === "DELETED" || !googleChange.proposedStartsAt || !googleChange.proposedEndsAt
              ? "O evento deste atendimento foi excluído no Google. Aceitar cancela o atendimento (pelo consultório); reverter devolve o evento ao Google."
              : `O evento foi movido no Google para ${formatLongDate(toZoned(googleChange.proposedStartsAt, timeZone).date)}, ${formatTime(googleChange.proposedStartsAt, timeZone)} às ${formatTime(googleChange.proposedEndsAt, timeZone)}. Aceitar remarca o atendimento; reverter devolve o horário ao Google.`}
          </p>
          <GoogleChangeActions practiceId={practiceId} changeId={googleChange.id} canOverbook={can(role, "appointments:overbook")} />
        </section>
      ) : null}

      <StatusActions
        practiceId={practiceId}
        appointmentId={appointment.id}
        status={appointment.status}
        next={view.next}
        correction={isFinal(appointment.status)}
        reschedule={
          view.canReschedule
            ? {
                canOverbook: can(role, "appointments:overbook"),
                defaults: { date: start.date, time: start.time, professionalId: appointment.professional.id, locationId: appointment.location.id },
                professionals: view.professionals,
              }
            : null
        }
      />

      <nav aria-label="Seções do agendamento" className="flex gap-[18px] border-b border-border">
        {tabs.map((option) => (
          <Link
            key={option}
            href={tabHref(option)}
            scroll={false}
            replace
            aria-current={option === tab ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent py-2.5 text-[13.5px] font-medium text-[#3A4542]",
              option === tab && "border-primary font-semibold text-primary",
            )}
          >
            {TAB_LABELS[option]}
            {counts[option] ? <span className="text-xs font-medium text-muted-foreground">{counts[option]}</span> : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function SummaryTab({ practiceId, view, role }: { practiceId: string; view: AppointmentView; role: AccessRole }) {
  const { appointment } = view;
  return (
    <>
      <Group title="Atendimento">
        <Row label="Tipo">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-[9px] rounded-full" style={{ background: appointment.type.color }} />
            {appointment.type.name}
          </span>
          <span className="block text-xs text-muted-foreground">
            {CATEGORY_LABELS[appointment.type.category]} · no Google e no WhatsApp: {appointmentTypeDisplayName(appointment.type)}
          </span>
        </Row>
        <Row label="Profissional">{appointment.professional.name}</Row>
        <Row label="Unidade">
          {appointment.location.name}
          <span className="block text-xs text-muted-foreground">{appointment.location.address}</span>
        </Row>
        <Row label="Duração e valor">
          {appointment.durationMinutes} min · {formatCents(appointment.priceCents)}
        </Row>
        <Row label="Convênio">{appointment.insurance ?? "Particular"}</Row>
        <Row label="Origem do lead">{appointment.leadSource ? LEAD_SOURCE_LABELS[appointment.leadSource] : "Não informada"}</Row>
        {appointment.flags.length > 0 ? <Row label="Marcadores">{appointment.flags.map((flag) => FLAG_LABELS[flag]).join(", ")}</Row> : null}
        {appointment.internalNote ? <Row label="Observação interna">{appointment.internalNote}</Row> : null}
      </Group>
      <Group title="Paciente">
        {appointment.patient.phone ? (
          <Row label="Celular">
            <a href={`tel:${appointment.patient.phone.replace(/[^+\d]/g, "")}`} className="text-primary hover:underline">
              {appointment.patient.phone}
            </a>
          </Row>
        ) : null}
        {can(role, "patients:view") ? (
          <Row label="Ficha">
            <Link href={`/conta/${practiceId}/pacientes/${appointment.patient.id}`} className="font-medium text-primary hover:underline">
              Ver todos os agendamentos
            </Link>
          </Row>
        ) : null}
      </Group>
      <Group title="Integrações">
        <Row label="Régua">
          {appointment.type.cadenceName ?? "Nenhuma"}
          {!appointment.cadenceEnabled ? <span className="block text-xs text-muted-foreground">Desligada: agendamento importado, o gestor liga em Pacientes › Importar planilha</span> : null}
        </Row>
        {appointment.google.linked ? (
          <Row label="Google Agenda">
            {appointment.google.error
              ? "Não chegou ao Google; a agenda tenta de novo na próxima mudança."
              : appointment.google.exporting
                ? "Enviando ao Google…"
                : appointment.google.inCalendar
                  ? "No calendário do consultório, no Google do profissional"
                  : "Fora do Google (cancelado, remarcado ou passado)"}
          </Row>
        ) : null}
        {appointment.crm.connected ? (
          <Row label="SynkronosCRM">
            {appointment.crm.error
              ? "Não chegou à Synkronos; o gestor pode tentar de novo em Segurança e integrações."
              : appointment.crm.exporting
                ? "Enviando à Synkronos…"
                : appointment.crm.inConversation
                  ? "Na conversa do paciente, com a etiqueta de status"
                  : "Fora da Synkronos (paciente sem celular, ou agendamento anterior à conexão)"}
          </Row>
        ) : null}
      </Group>
    </>
  );
}

function MessagesTab({ practiceId, view }: { practiceId: string; view: AppointmentView }) {
  const { appointment, log } = view;
  if (!log) return null;
  const timeZone = appointment.location.timeZone;
  return (
    <>
      <p className="text-[13px] text-muted-foreground" data-testid="cadence-situation">
        {log.cadenceName ? `${log.cadenceName} · ` : ""}
        {SITUATION_TEXT[log.situation]}
      </p>
      <CadenceActions practiceId={practiceId} appointmentId={appointment.id} manualSteps={log.manualSteps} canRecordContact={log.canRecordContact} canResume={log.canResume} />
      {log.entries.length > 0 ? (
        <ol className="flex flex-col divide-y divide-[#EEF1F0]" data-testid="dispatch-log">
          {log.entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1.5 py-3 text-[13.5px]">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">
                  {entry.position ? `Passo ${entry.position}` : "Mensagem"}
                  {entry.manual ? " · manual" : ""}
                </span>
                <span className="text-muted-foreground">{entry.description}</span>
                <span className={`ml-auto inline-flex h-[22px] items-center rounded-full px-2.5 text-xs font-semibold ${DISPATCH_BADGE[entry.status]}`} data-testid="dispatch-status">
                  {DISPATCH_STATUS_LABELS[entry.status]}
                </span>
              </div>
              <p className="text-[12.5px] text-muted-foreground">
                {entry.sentAt ? `Enviada em ${moment(entry.sentAt, timeZone)}` : `Prevista para ${moment(entry.scheduledFor, timeZone)}`}
                {entry.reason ? ` · ${DISPATCH_REASON_LABELS[entry.reason] ?? entry.reason}` : ""}
                {entry.version ? ` · versão ${entry.version} da régua` : ""}
              </p>
              {entry.text ? <p className="rounded-lg bg-[#F8FAF9] px-2.5 py-2 text-[13px] leading-snug whitespace-pre-line text-[#3A4542]">{entry.text}</p> : null}
              {entry.replyText ? (
                <p>
                  <span className="font-medium">Resposta:</span> {entry.replyText}
                  {entry.repliedAt ? <span className="text-muted-foreground"> · {moment(entry.repliedAt, timeZone)}</span> : null}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma mensagem planejada para este agendamento.</p>
      )}
    </>
  );
}

function HistoryTab({ view }: { view: AppointmentView }) {
  const { appointment } = view;
  const timeZone = appointment.location.timeZone;
  return (
    <ol className="flex flex-col divide-y divide-[#EEF1F0]" data-testid="history">
      {appointment.history.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-0.5 py-2.5 text-[13.5px]">
          <span className="font-semibold">
            {entry.fromStatus ? `${STATUS_LABELS[entry.fromStatus]} → ` : ""}
            {STATUS_LABELS[entry.toStatus]}
          </span>
          <span className="text-muted-foreground">
            {entry.authorName} · {moment(entry.changedAt, timeZone)}
          </span>
          {entry.reason ? <span className="text-muted-foreground">Motivo: {entry.reason}</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function AppointmentTabContent({ practiceId, view, role, tab }: { practiceId: string; view: AppointmentView; role: AccessRole; tab: AppointmentTab }) {
  if (tab === "mensagens" && view.log) return <MessagesTab practiceId={practiceId} view={view} />;
  if (tab === "historico") return <HistoryTab view={view} />;
  return <SummaryTab practiceId={practiceId} view={view} role={role} />;
}

/** The appointment over the agenda, keeping the week in sight and in the URL (D-83). */
export function AppointmentPanel({
  practiceId,
  view,
  role,
  tab,
  closeHref,
  tabHref,
}: {
  practiceId: string;
  view: AppointmentView;
  role: AccessRole;
  tab: AppointmentTab;
  closeHref: string;
  tabHref: (tab: AppointmentTab) => string;
}) {
  return (
    <UrlPanel
      title={view.appointment.patient.name}
      closeHref={closeHref}
      header={<AppointmentHeading practiceId={practiceId} view={view} role={role} tab={tab} tabHref={tabHref} closeHref={closeHref} inPanel />}
    >
      <AppointmentTabContent practiceId={practiceId} view={view} role={role} tab={tab} />
    </UrlPanel>
  );
}
