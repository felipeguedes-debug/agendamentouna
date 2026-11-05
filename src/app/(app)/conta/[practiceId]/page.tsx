import { ChevronLeft, ChevronRight, Lock, Plus } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/app-ui";
import { buttonVariants } from "@/components/ui/button";
import { agendaTimeZone, listWithoutClosing, loadAgenda, type AgendaItem, type AppointmentItem, type BlockItem } from "@/lib/agenda/agenda";
import {
  agendaHref,
  AGENDA_VIEWS,
  isFutureSlot,
  isPhoneUserAgent,
  parseAgendaPanel,
  parseAgendaParams,
  withPanel,
  type AgendaQuery,
  type AgendaView,
} from "@/lib/agenda/params";
import { getManualBlock } from "@/lib/agenda/time-blocks";
import { ownProfessionalIds } from "@/lib/appointments/appointments";
import { isFinal, nextStatuses, STATUSES } from "@/lib/appointments/status";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { addDays, addMonths, formatLongDate, formatMonthTitle, formatWeekRange, todayIn, toZoned, weekdayOf } from "@/lib/dates/zoned";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/domain/labels";
import { brokenGoogleLinks } from "@/lib/google/profile";
import { cn } from "@/lib/utils";
import { AppointmentPanel, loadAppointmentView } from "./_agenda/appointment-detail";
import { BlockPanel } from "./_agenda/block-panel";
import { AgendaFilters } from "./_agenda/filters";
import { AgendaSummary, DayList, dayColumnLabel, HourGrid, MonthGrid, type GridColumn } from "./_agenda/views";

export const metadata: Metadata = { title: "Agenda" };

const VIEW_LABELS: Record<AgendaView, string> = { dia: "Dia", semana: "Semana", mes: "Mês", lista: "Lista" };

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shift(query: AgendaQuery, direction: 1 | -1): string {
  if (query.view === "semana") return addDays(query.date, 7 * direction);
  if (query.view === "mes") return addMonths(query.date, direction);
  return addDays(query.date, direction);
}

/** The practice home: the agenda (PRD 4, D-82), with its state and its panels in the URL (D-41, D-83). */
export default async function AgendaPage({ params, searchParams }: PageProps<"/conta/[practiceId]">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, ["agenda:view", "agenda:view-own"]);
  const { access, db } = context;
  const { role } = access;
  const timeZone = await agendaTimeZone(db);
  const moment = new Date();
  const today = todayIn(timeZone, moment);
  const search = await searchParams;
  const defaultView: AgendaView = isPhoneUserAgent((await headers()).get("user-agent")) ? "lista" : "semana";
  const query = parseAgendaParams(search, today, defaultView);
  const panel = parseAgendaPanel(search);

  // The panels answer 404 before anything is sent (D-72).
  const appointmentView = panel?.kind === "appointment" ? await loadAppointmentView(context, panel.id) : null;
  if (panel?.kind === "appointment" && !appointmentView) notFound();
  const block = panel?.kind === "block" ? await getManualBlock(context, panel.id) : null;
  if (panel?.kind === "block" && !block) notFound();

  const [agenda, withoutClosing, own, googleBroken] = await Promise.all([
    loadAgenda(context, query),
    query.view === "lista" ? listWithoutClosing(context, query) : Promise.resolve([]),
    ownProfessionalIds(context),
    brokenGoogleLinks(context),
  ]);
  const canBook = can(role, "appointments:manage");
  const blocksAny = can(role, "time-blocks:manage");
  const blocksOwn = can(role, "time-blocks:manage-own");
  const office = can(role, "agenda:view");
  const href = (change: Partial<AgendaQuery>) => agendaHref(practiceId, { ...query, ...change }, today, defaultView);
  const closeHref = href({});
  // A final status is corrected in the detail, with a reason (D-11), not from the list.
  const nextFor = (item: AppointmentItem) => (isFinal(item.status) ? [] : nextStatuses(item.status, { kind: "user", role, ownsAppointment: own.includes(item.professionalId) }));
  const cardHref = (item: AppointmentItem) => withPanel(closeHref, { kind: "appointment", id: item.id, tab: "resumo" });
  const blockHref = (item: BlockItem) => (item.source === "MANUAL" && (blocksAny || (blocksOwn && own.includes(item.professionalId))) ? withPanel(closeHref, { kind: "block", id: item.id }) : null);
  const multipleProfessionals = !agenda.selectedProfessionalId && agenda.professionals.length > 1;

  const zonedNow = toZoned(moment, timeZone);
  const now = { date: today, hour: zonedNow.hour, minute: zonedNow.minute, time: zonedNow.time };
  const newBlockHref = (date: string, time: string | null, professionalId: string | null) => withPanel(closeHref, { kind: "new-block", date, time, professionalId });
  /** In the week the column is the day; in the day it is the professional. */
  const slotFor = (column: GridColumn, hour: number) => {
    if (!isFutureSlot({ date: column.date, hour }, now)) return null;
    const professionalId = query.view === "dia" ? column.key : agenda.selectedProfessionalId;
    const time = `${String(hour).padStart(2, "0")}:00`;
    const mayBlock = blocksAny || (blocksOwn && (!professionalId || own.includes(professionalId)));
    const book = canBook ? `/conta/${practiceId}/agendamentos/novo?data=${column.date}&hora=${time}${professionalId ? `&profissional=${professionalId}` : ""}` : null;
    const blockLink = mayBlock ? newBlockHref(column.date, time, professionalId) : null;
    return book || blockLink ? { book, block: blockLink } : null;
  };

  // Weekend columns only when something happens on them.
  const weekDays = agenda.days.filter((day) => weekdayOf(day) % 6 !== 0 || agenda.items.some((item) => item.date === day));
  const title =
    query.view === "semana"
      ? formatWeekRange(weekDays[0], weekDays.at(-1)!)
      : query.view === "mes"
        ? capitalize(formatMonthTitle(query.date))
        : capitalize(formatLongDate(query.date));
  const pendingHref = office ? `/conta/${practiceId}/pendencias?motivo=sem-confirmacao` : null;
  const newAppointmentHref = `/conta/${practiceId}/agendamentos/novo?data=${query.date}${agenda.selectedProfessionalId ? `&profissional=${agenda.selectedProfessionalId}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      {agenda.ownOnly && agenda.professionals.length === 0 ? (
        <Alert tone="info">Seu usuário ainda não está ligado a um profissional desta conta. Peça ao gestor para fazer o vínculo.</Alert>
      ) : null}

      {googleBroken.length > 0 ? (
        // PRD 5, rule 6: the warning on the manager's panel (and the professional's own); the agenda goes on without Google.
        <div role="alert" className="rounded-xl border border-[#FCD9A6] bg-[#FEF3E2] px-4 py-3 text-sm text-[#92400E]">
          <strong>Google Agenda desconectado:</strong> {googleBroken.map((row) => row.name).join(", ")}. A agenda continua funcionando, sem sincronizar com o Google.{" "}
          <Link href={can(role, "google:send-link") ? `/conta/${practiceId}/profissionais` : `/conta/${practiceId}/perfil`} className="font-medium underline">
            Vincular de novo
          </Link>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-border bg-white">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 border-b border-[#EEF1F0] px-4 py-3">
          <nav aria-label="Visualização" className="flex gap-0.5 rounded-[9px] bg-secondary p-[3px]">
            {AGENDA_VIEWS.map((view) => (
              <Link
                key={view}
                href={href({ view })}
                aria-current={view === query.view ? "page" : undefined}
                className={cn("rounded-[7px] px-3 py-1.5 text-[13px] font-medium text-[#3A4542]", view === query.view && "bg-white font-semibold text-foreground shadow-xs")}
              >
                {VIEW_LABELS[view]}
              </Link>
            ))}
          </nav>
          <div className="flex w-full items-center gap-2 md:w-auto">
            <Link href={href({ date: shift(query, -1) })} aria-label="Período anterior" className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
              <ChevronLeft aria-hidden />
            </Link>
            <h1 className="min-w-0 flex-1 text-center text-[15px] font-semibold md:min-w-44 md:flex-none md:text-base">{title}</h1>
            <Link href={href({ date: shift(query, 1) })} aria-label="Próximo período" className={buttonVariants({ variant: "outline", size: "icon-lg" })}>
              <ChevronRight aria-hidden />
            </Link>
            <Link href={href({ date: today })} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Hoje
            </Link>
          </div>
          <div className="flex w-full items-center gap-2 md:w-auto">
            <AgendaFilters
              practiceId={practiceId}
              query={query}
              today={today}
              defaultView={defaultView}
              professionals={agenda.ownOnly ? [] : agenda.professionals.map((professional) => ({ value: professional.id, label: professional.name }))}
              categories={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }))}
              statuses={[...STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })), { value: "NO_CONFIRMATION", label: "Sem confirmação" }]}
            />
            {blocksAny || blocksOwn ? (
              <Link href={newBlockHref(query.date, null, agenda.selectedProfessionalId)} scroll={false} className={buttonVariants({ variant: "outline", size: "lg" })}>
                <Lock aria-hidden />
                <span className="sr-only md:not-sr-only">Bloquear</span>
              </Link>
            ) : null}
          </div>
        </header>

        <AgendaSummary totals={agenda.totals} pendingHref={pendingHref} />

        {query.view === "semana" ? (
          <HourGrid
            columns={weekDays.map((day) => ({
              key: day,
              date: day,
              label: (
                <Link href={href({ view: "dia", date: day })} prefetch={false} className="flex items-center gap-2 hover:underline">
                  {dayColumnLabel(day, today)}
                </Link>
              ),
              highlight: day === today,
            }))}
            items={agenda.items}
            columnOf={(item: AgendaItem) => item.date}
            showProfessional={multipleProfessionals}
            cardHref={cardHref}
            blockHref={blockHref}
            slotFor={slotFor}
            now={now}
            today={today}
          />
        ) : null}

        {query.view === "dia" ? (
          <HourGrid
            columns={professionalColumns(agenda).map((column) => ({ ...column, date: query.date }))}
            items={agenda.items}
            columnOf={(item: AgendaItem) => item.professionalId}
            showProfessional={false}
            cardHref={cardHref}
            blockHref={blockHref}
            slotFor={slotFor}
            now={now}
            today={today}
          />
        ) : null}

        {query.view === "mes" ? <MonthGrid days={agenda.days} items={agenda.items} today={today} dayHref={(date) => href({ view: "dia", date })} cardHref={cardHref} /> : null}

        {query.view === "lista" ? (
          <>
            {withoutClosing.length > 0 && office ? (
              // D-13: the list says it, and the work is in Pendências (D-84).
              <Link
                href={`/conta/${practiceId}/pendencias?motivo=sem-baixa`}
                data-testid="without-closing-banner"
                className="flex items-center gap-2 border-b border-[#FCD9A6] bg-[#FEF3E2] px-4 py-2.5 text-[13px] font-medium text-[#92400E]"
              >
                {withoutClosing.length === 1 ? "1 atendimento de dias anteriores sem baixa" : `${withoutClosing.length} atendimentos de dias anteriores sem baixa`}
                <span className="ml-auto inline-flex items-center gap-1 font-semibold">
                  Ver em Pendências
                  <ChevronRight aria-hidden className="size-3.5" />
                </span>
              </Link>
            ) : null}
            <section aria-label="Lista do dia">
              <DayList
                practiceId={practiceId}
                items={agenda.items.filter((item): item is AppointmentItem => item.kind === "appointment")}
                cardHref={cardHref}
                nextFor={nextFor}
                emptyText="Nenhum agendamento neste dia."
              />
            </section>
          </>
        ) : null}
      </div>

      {canBook ? (
        // The phone's way to book; on a larger screen, Agendar is on the top bar.
        <Link
          href={newAppointmentHref}
          aria-label="Agendar"
          className="fixed right-4 bottom-[86px] z-20 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(15,23,42,0.28)] md:hidden"
        >
          <Plus aria-hidden className="size-6" strokeWidth={2.2} />
        </Link>
      ) : null}

      {panel?.kind === "appointment" && appointmentView ? (
        <AppointmentPanel
          role={role}
          practiceId={practiceId}
          view={appointmentView}
          tab={panel.tab}
          closeHref={closeHref}
          tabHref={(tab) => withPanel(closeHref, { kind: "appointment", id: panel.id, tab })}
        />
      ) : null}
      {panel?.kind === "new-block" ? (
        <BlockPanel
          practiceId={practiceId}
          closeHref={closeHref}
          professionals={agenda.professionals.filter((professional) => blocksAny || own.includes(professional.id))}
          defaults={{
            professionalId: panel.professionalId ?? agenda.selectedProfessionalId ?? "",
            date: panel.date ?? query.date,
            startTime: panel.time ?? "",
            endTime: panel.time ? `${String(Number(panel.time.slice(0, 2)) + 1).padStart(2, "0")}${panel.time.slice(2)}` : "",
            allDay: false,
            reason: "",
          }}
        />
      ) : null}
      {panel?.kind === "block" && block ? (
        <BlockPanel
          practiceId={practiceId}
          closeHref={closeHref}
          professionals={agenda.professionals.filter((professional) => blocksAny || own.includes(professional.id))}
          block={block}
          defaults={block}
        />
      ) : null}
    </div>
  );
}

/** One column per professional, side by side (multi-professional day), or the one selected. */
function professionalColumns(agenda: Awaited<ReturnType<typeof loadAgenda>>) {
  const columns = new Map<string, string>();
  for (const professional of agenda.professionals) {
    if (!agenda.selectedProfessionalId || professional.id === agenda.selectedProfessionalId) columns.set(professional.id, professional.name);
  }
  for (const item of agenda.items) if (!columns.has(item.professionalId)) columns.set(item.professionalId, item.professionalName);
  return [...columns].map(([key, label]) => ({ key, label }));
}
