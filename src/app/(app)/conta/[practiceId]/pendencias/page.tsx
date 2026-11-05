import type { Metadata } from "next";
import Link from "next/link";
import { QuickActions } from "../_agenda/quick-actions";
import { nextStatuses } from "@/lib/appointments/status";
import { ownProfessionalIds } from "@/lib/appointments/appointments";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { formatDateBr, formatDayLabel, formatTime, toZoned } from "@/lib/dates/zoned";
import { brokenGoogleLinks } from "@/lib/google/profile";
import { loadPending, pendingToday, type PendingRow } from "@/lib/pending/pending";
import {
  countByFilter,
  groupByDay,
  parsePendingFilter,
  PENDING_FILTER_LABELS,
  PENDING_FILTERS,
  rowsFor,
  showsConfirmationWork,
  type PendingReason,
} from "@/lib/pending/rules";
import { cn } from "@/lib/utils";
import { GoogleChangeActions } from "./_pendencias/change-actions";
import { FollowUpActions } from "./_pendencias/follow-up-actions";
import { ConfirmationWorkTimer } from "./_pendencias/work-timer";

export const metadata: Metadata = { title: "Pendências" };

const REASONS: Record<PendingReason, { label: string; tone: string }> = {
  unconfirmed: { label: "Sem confirmação", tone: "bg-[#FEF3E2] text-[#B45309]" },
  reschedule_requested: { label: "Pediu remarcação", tone: "bg-[#EEF1F0] text-[#3A4542]" },
  replied: { label: "Respondeu sem confirmar", tone: "bg-[#EEF1F0] text-[#3A4542]" },
  google_change: { label: "Mudança no Google", tone: "bg-[#EEF2FB] text-[#3B5BDB]" },
  google_conflict: { label: "Conflito com o Google", tone: "bg-[#EEF2FB] text-[#3B5BDB]" },
  without_closing: { label: "Sem baixa", tone: "bg-[#FEF3E2] text-[#B45309]" },
};

function moment(instant: Date, timeZone: string) {
  const start = toZoned(instant, timeZone);
  return `${formatDayLabel(start.date)} · ${formatDateBr(start.date)} ${start.time}`;
}

/** What the row says about why it is here. */
function explanation(row: PendingRow) {
  switch (row.reason) {
    case "unconfirmed":
      return row.lastSentAt ? `Último pedido em ${moment(row.lastSentAt, row.timeZone)}, sem resposta.` : "O paciente não respondeu ao pedido de confirmação.";
    case "reschedule_requested":
      return "O paciente respondeu 2. Combine o novo horário e remarque.";
    case "replied":
      return "O paciente escreveu outra coisa e a régua pausou. A conversa está na SynkronosCRM.";
    case "google_change":
      return row.change?.kind === "DELETED" || !row.change?.proposedStartsAt || !row.change.proposedEndsAt
        ? "Excluído no Google. Aceitar cancela o atendimento; reverter devolve o evento ao Google."
        : `Movido no Google para ${moment(row.change.proposedStartsAt, row.timeZone)}–${formatTime(row.change.proposedEndsAt, row.timeZone)}.`;
    case "google_conflict":
      return `Compromisso Google no mesmo horário (${row.blocks
        .map((block) => (block.allDay ? "dia inteiro" : `${formatTime(block.startsAt, row.timeZone)}–${formatTime(block.endsAt, row.timeZone)}`))
        .join(", ")}). Nada foi cancelado.`;
    case "without_closing":
      return "O horário passou e o atendimento ainda espera Atendido, Faltou ou cancelamento.";
  }
}

/**
 * Pendências (PRD 11, D-84): everything that waits for someone in one list, by date,
 * with the action on the row. Filters by reason stay in the URL. Each row's action
 * still goes through its own service, which checks who may do it.
 */
export default async function PendingPage({ params, searchParams }: PageProps<"/conta/[practiceId]/pendencias">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, ["agenda:view", "google-changes:resolve", "google-changes:resolve-own"]);
  const { role } = context.access;
  const filter = parsePendingFilter((await searchParams).motivo);
  const [all, today, broken, own] = await Promise.all([loadPending(context), pendingToday(context), brokenGoogleLinks(context), ownProfessionalIds(context)]);
  const counts = countByFilter(all);
  const groups = groupByDay(rowsFor(all, filter), today);
  const base = `/conta/${practiceId}/pendencias`;
  const canAct = can(role, "appointments:manage");
  const canOverbook = can(role, "appointments:overbook");
  const appointmentHref = (id: string) => `/conta/${practiceId}/agendamentos/${id}`;
  const profileHref = (professionalId: string) => (can(role, "google:send-link") ? `/conta/${practiceId}/profissionais/${professionalId}` : `/conta/${practiceId}/perfil`);
  // Only the office has the Sem confirmação rows, and only they count time (D-75).
  const filters = can(role, "agenda:view") ? PENDING_FILTERS : PENDING_FILTERS.filter((option) => option === "todas" || option === "google");

  function rowActions(row: PendingRow) {
    switch (row.reason) {
      case "unconfirmed":
        return canAct ? <FollowUpActions practiceId={practiceId} appointmentId={row.appointmentId} actions={row.status === "SCHEDULED" ? ["confirm", "contact"] : ["contact"]} /> : null;
      case "reschedule_requested":
        return (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Link href={appointmentHref(row.appointmentId)} className="inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-[0.8rem] font-medium text-accent-foreground hover:brightness-95">
              Remarcar
            </Link>
            {canAct ? <FollowUpActions practiceId={practiceId} appointmentId={row.appointmentId} actions={["contact"]} /> : null}
          </div>
        );
      case "replied":
        return canAct ? <FollowUpActions practiceId={practiceId} appointmentId={row.appointmentId} actions={row.status === "SCHEDULED" ? ["confirm", "resume"] : ["resume"]} /> : null;
      case "google_change":
        return row.change ? <GoogleChangeActions practiceId={practiceId} changeId={row.change.id} canOverbook={canOverbook} /> : null;
      case "google_conflict":
        return (
          <Link href={appointmentHref(row.appointmentId)} className="inline-flex h-7 items-center rounded-lg bg-accent px-2.5 text-[0.8rem] font-medium text-accent-foreground hover:brightness-95">
            Ver atendimento
          </Link>
        );
      case "without_closing":
        return (
          <QuickActions
            practiceId={practiceId}
            appointmentId={row.appointmentId}
            status={row.status}
            next={nextStatuses(row.status, { kind: "user", role, ownsAppointment: row.professionalId !== null && own.includes(row.professionalId) })}
          />
        );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {showsConfirmationWork(all, filter) ? <ConfirmationWorkTimer practiceId={practiceId} /> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <h1 className="text-xl font-semibold">Pendências</h1>
        <nav aria-label="Filtrar pendências" className="flex flex-wrap gap-1.5">
          {filters.map((option) => {
            const active = option === filter;
            return (
              <Link
                key={option}
                href={option === "todas" ? base : `${base}?motivo=${option}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center gap-1.5 rounded-full border border-input bg-white px-3 text-[13px] font-semibold text-[#3A4542] md:h-[34px]",
                  active && "border-primary bg-primary text-primary-foreground",
                )}
              >
                {PENDING_FILTER_LABELS[option]}
                <span className="font-medium">{counts[option]}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {broken.length > 0 ? (
        <div role="alert" className="rounded-xl border border-[#FCD9A6] bg-[#FEF3E2] px-4 py-3 text-sm text-[#92400E]">
          <strong>Google Agenda desconectado.</strong> A agenda continua funcionando, sem sincronizar com o Google, até o profissional vincular de novo:{" "}
          {broken.map((row, index) => (
            <span key={row.id}>
              {index > 0 ? ", " : ""}
              <Link href={profileHref(row.id)} className="font-medium underline">
                {row.name}
              </Link>
            </span>
          ))}
          .
        </div>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-xl border border-border bg-white px-4 py-10 text-center text-sm text-muted-foreground">
          {filter === "todas" ? "Nada esperando por você." : "Nada com este motivo."}
        </p>
      ) : (
        <section aria-label="Lista de pendências" className="overflow-hidden rounded-xl border border-border bg-white">
          {groups.map((group) => (
            <div key={group.key}>
              <h2 className="border-b border-[#EEF1F0] bg-[#F8FAF9] px-4 py-2 text-xs font-semibold text-muted-foreground">{group.label}</h2>
              <ol>
                {group.rows.map((row) => (
                  <li key={row.key} data-testid="pending-row" data-reason={row.reason} className="flex flex-wrap items-start gap-x-3.5 gap-y-2 border-b border-[#EEF1F0] px-4 py-3 last:border-b-0">
                    <span className="flex w-14 flex-col font-semibold tabular-nums">
                      {row.time}
                      {group.key === "past" ? <span className="text-[11px] font-normal text-muted-foreground">{formatDateBr(row.date).slice(0, 5)}</span> : null}
                    </span>
                    <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link href={appointmentHref(row.appointmentId)} className="font-semibold hover:underline">
                          {row.patientName}
                        </Link>
                        <span className={cn("inline-flex h-[22px] items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", REASONS[row.reason].tone)}>{REASONS[row.reason].label}</span>
                      </span>
                      <span className="text-[12.5px] text-muted-foreground">
                        {[row.typeName, row.professionalName, row.patientPhone].filter(Boolean).join(" · ")}
                      </span>
                      <span className="text-[13px] text-[#3A4542]">{explanation(row)}</span>
                      {row.lastReply && (row.reason === "replied" || row.reason === "reschedule_requested") ? (
                        <span className="self-start rounded-lg bg-secondary px-2.5 py-1.5 text-[13px] text-[#3A4542]">“{row.lastReply}”</span>
                      ) : null}
                    </div>
                    <div className="ml-auto flex flex-wrap justify-end">{rowActions(row)}</div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
