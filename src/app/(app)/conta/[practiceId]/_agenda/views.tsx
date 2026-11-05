import { CalendarDays, Lock, Plus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { isCanceled, StatusBadge, StatusIcon } from "@/components/status-badge";
import type { AgendaItem, AgendaTotals, AppointmentItem, BlockItem } from "@/lib/agenda/agenda";
import { formatDateBr, formatDayLabel, type IsoDate } from "@/lib/dates/zoned";
import { BLOCK_COLOR, CATEGORY_COLORS, tintOf } from "@/lib/domain/colors";
import { CATEGORY_LABELS } from "@/lib/domain/labels";
import { formatCents } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import { QuickActions } from "./quick-actions";

// Server-rendered agenda views (PRD 4, D-82). A week has dozens of cards and free slots:
// their links do not prefetch, or each view would send about 120 requests to the server,
// competing with what the user just asked for (D-82).

const CANCELED_COLOR = { hex: "#DC2626", tint: "#FDECEC" };
const DEFAULT_FIRST_HOUR = 7;
const DEFAULT_LAST_HOUR = 18;

export function CategoryLegend({ className }: { className?: string }) {
  const entries = (["CONSULTATION", "FOLLOW_UP", "PROCEDURE", "EXAM", "BLOCK"] as const).map((category) => ({
    label: CATEGORY_LABELS[category],
    color: CATEGORY_COLORS[category],
  }));
  return (
    <span className={cn("flex flex-wrap items-center gap-3 text-xs text-muted-foreground", className)}>
      {entries.map((entry) => (
        <span key={entry.label} className="inline-flex items-center gap-1.5">
          <span className="size-[9px] rounded-[3px]" style={{ background: entry.color }} />
          {entry.label}
        </span>
      ))}
    </span>
  );
}

/** The period in one line, in place of four cards (D-82). */
export function AgendaSummary({ totals, pendingHref }: { totals: AgendaTotals; pendingHref: string | null }) {
  const value = (amount: ReactNode, text: string) => (
    <span className="text-muted-foreground">
      <strong className="font-semibold text-foreground">{amount}</strong> {text}
    </span>
  );
  const noConfirmation = `${totals.withoutConfirmation} sem confirmação`;
  return (
    <section aria-label="Resumo do período" className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-[#EEF1F0] px-4 py-2.5 text-[13px]">
      {value(totals.scheduled, "agendados")}
      {pendingHref ? (
        <Link href={pendingHref} className="font-semibold text-[#B45309] underline">
          {noConfirmation}
        </Link>
      ) : (
        <span className="font-semibold text-[#B45309]">{noConfirmation}</span>
      )}
      {value(formatCents(totals.predictedCents, { compact: true }), "previsto")}
      {value(formatCents(totals.realizedCents, { compact: true }), "realizado")}
      <CategoryLegend className="ml-auto hidden md:flex" />
    </section>
  );
}

function Attention({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <span data-testid={testId} className="inline-flex h-[18px] self-start rounded-full border border-[#FCD9A6] bg-white px-1.5 text-[11px] font-semibold whitespace-nowrap text-[#B45309]">
      {children}
    </span>
  );
}

function initials(name: string) {
  const parts = name.replace(/^Dra?\.\s+/, "").split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts.at(-1)![0] : ""}`.toUpperCase();
}

/** Patient, time and type; the status is an icon and only what asks for action has words (D-82). */
export function AppointmentCard({
  href,
  item,
  showProfessional,
  withoutClosing,
}: {
  href: string;
  item: AppointmentItem;
  showProfessional: boolean;
  withoutClosing?: boolean;
}) {
  const canceled = isCanceled(item.status);
  const color = canceled ? CANCELED_COLOR : { hex: item.color, tint: tintOf(item.color) };
  return (
    <Link
      href={href}
      scroll={false}
      prefetch={false}
      data-testid="appointment-card"
      className={cn("relative z-[1] flex min-w-0 flex-col gap-0.5 rounded-lg border-l-3 px-2 py-1.5 text-left hover:brightness-95", item.status === "RESCHEDULED" && "opacity-60")}
      style={{ background: color.tint, borderLeftColor: color.hex }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn("min-w-0 flex-1 truncate text-[12.5px] font-semibold", canceled && "text-muted-foreground line-through")}>{item.patientName}</span>
        <StatusIcon status={item.status} noConfirmation={item.noConfirmation} />
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-[#3A4542]">
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold">{item.time}</span> · {item.typeName}
        </span>
        {showProfessional ? (
          <span title={item.professionalName} className="inline-flex h-4 min-w-[18px] shrink-0 items-center justify-center rounded bg-white/85 px-[3px] text-[10px] font-semibold">
            {initials(item.professionalName)}
          </span>
        ) : null}
      </span>
      {item.noConfirmation ? <Attention>Sem confirmação</Attention> : null}
      {item.rescheduleRequested ? <Attention>Pediu remarcação</Attention> : null}
      {item.repliedWithoutConfirming ? <Attention>Respondeu</Attention> : null}
      {item.googlePending ? <Attention testId="google-pending">Pendência do Google</Attention> : null}
      {withoutClosing ? <Attention>Sem baixa</Attention> : null}
    </Link>
  );
}

/** A manual block opens to be edited, when the user may; a Google one only changes in Google. */
export function BlockCard({ item, showProfessional, href }: { item: BlockItem; showProfessional: boolean; href: string | null }) {
  const google = item.source === "GOOGLE";
  const content = (
    <>
      <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        {google ? <CalendarDays role="img" aria-label="Do Google Agenda" className="size-3 shrink-0" /> : <Lock role="img" aria-label="Bloqueio manual" className="size-3 shrink-0" />}
        <span className="truncate">{google ? "Compromisso Google" : `Bloqueio${item.reason ? `: ${item.reason}` : ""}`}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">
        {item.allDay ? "Dia inteiro" : `${item.time} às ${item.endTime}`}
        {showProfessional ? ` · ${initials(item.professionalName)}` : ""}
      </span>
    </>
  );
  const shared = "relative z-[1] flex min-w-0 flex-col gap-0.5 rounded-lg border-l-3 px-2 py-1.5";
  const style = { background: BLOCK_COLOR.tint, borderLeftColor: BLOCK_COLOR.hex };
  return href ? (
    <Link href={href} scroll={false} prefetch={false} data-testid="block-card" className={cn(shared, "hover:brightness-95")} style={style}>
      {content}
    </Link>
  ) : (
    <div data-testid="block-card" className={shared} style={style}>
      {content}
    </div>
  );
}

export type GridColumn = { key: string; label: ReactNode; date: IsoDate; highlight?: boolean };
export type Slot = { book: string | null; block: string | null };

function FreeSlot({ slot, label }: { slot: Slot; label: string }) {
  // Hover shows it; these stay out of the tab order, or a week would be 100 stops:
  // the keyboard has Agendar and Bloquear on the bar.
  return (
    <span data-testid="free-slot" className="flex gap-1 opacity-0 group-hover/cell:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
      {slot.book ? (
        <Link
          href={slot.book}
          prefetch={false}
          tabIndex={-1}
          aria-label={`Agendar ${label}`}
          className="flex h-8 min-w-0 flex-1 items-center justify-center gap-1 rounded-lg border-[1.5px] border-dashed border-primary text-xs font-semibold text-primary"
        >
          <Plus aria-hidden className="size-3 shrink-0" />
          <span className="truncate">Agendar</span>
        </Link>
      ) : null}
      {slot.block ? (
        <Link
          href={slot.block}
          scroll={false}
          prefetch={false}
          tabIndex={-1}
          aria-label={`Bloquear ${label}`}
          title={`Bloquear ${label}`}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-dashed border-input text-muted-foreground"
        >
          <Lock aria-hidden className="size-3.5" />
        </Link>
      ) : null}
    </span>
  );
}

/**
 * Hour rows by columns: days of the week, or professionals side by side in the
 * multi-professional day. Up to 8 columns fit without scrolling.
 */
export function HourGrid({
  columns,
  items,
  columnOf,
  showProfessional,
  cardHref,
  blockHref,
  slotFor,
  now,
  today,
}: {
  columns: GridColumn[];
  items: AgendaItem[];
  columnOf: (item: AgendaItem) => string;
  showProfessional: boolean;
  cardHref: (item: AppointmentItem) => string;
  blockHref: (item: BlockItem) => string | null;
  slotFor: (column: GridColumn, hour: number) => Slot | null;
  now: { date: IsoDate; hour: number; minute: number; time: string };
  today: IsoDate;
}) {
  const allDay = items.filter((item) => item.kind === "block" && item.allDay);
  const timed = items.filter((item) => !(item.kind === "block" && item.allDay));
  const hours = timed.map((item) => item.hour);
  const firstHour = Math.min(DEFAULT_FIRST_HOUR, ...hours);
  const lastHour = Math.max(DEFAULT_LAST_HOUR, ...hours);
  const template = { gridTemplateColumns: `56px repeat(${columns.length}, minmax(0, 1fr))` };
  const minWidth = columns.length > 8 ? { minWidth: `${56 + columns.length * 140}px` } : { minWidth: "720px" };
  const rows: { key: string; label: string; hour: number | null; items: AgendaItem[] }[] = [];
  if (allDay.length > 0) rows.push({ key: "all-day", label: "Dia inteiro", hour: null, items: allDay });
  for (let hour = firstHour; hour <= lastHour; hour += 1) {
    const label = `${String(hour).padStart(2, "0")}:00`;
    rows.push({ key: label, label, hour, items: timed.filter((item) => item.hour === hour) });
  }
  const showsNow = columns.some((column) => column.date === now.date);
  const nowTop = `${Math.round((now.minute / 60) * 100)}%`;

  return (
    <section aria-label="Grade da agenda" className="overflow-x-auto">
      <div style={minWidth}>
        <div className="grid border-b border-border" style={template}>
          <div />
          {columns.map((column) => (
            <div key={column.key} className={cn("flex items-center gap-2 border-l border-[#EEF1F0] px-3 py-2.5 text-[13px] font-semibold", column.highlight && "bg-[#F3F9F7] text-primary")}>
              {column.label}
            </div>
          ))}
        </div>
        {rows.map((row) => {
          const nowHere = showsNow && row.hour === now.hour;
          return (
            <div key={row.key} className="grid border-b border-[#EEF1F0] last:border-b-0" style={template}>
              <div className="relative px-2 py-[7px] text-[11.5px] text-muted-foreground tabular-nums">
                {row.label}
                {nowHere ? (
                  <span className="absolute left-2 bg-white font-semibold text-[#DC2626]" style={{ top: `calc(${nowTop} - 7px)` }}>
                    {now.time}
                  </span>
                ) : null}
              </div>
              {columns.map((column) => {
                const cellItems = row.items.filter((item) => columnOf(item) === column.key);
                const slot = row.hour !== null && cellItems.length === 0 ? slotFor(column, row.hour) : null;
                return (
                  <div key={column.key} className={cn("group/cell relative flex min-h-[50px] flex-col gap-1 border-l border-[#EEF1F0] p-1", column.highlight && "bg-[#F3F9F7]")}>
                    {nowHere && column.date === now.date ? (
                      <span role="img" aria-label={`Agora, ${now.time}`} className="absolute inset-x-0 h-0.5 bg-[#DC2626]" style={{ top: nowTop }} />
                    ) : null}
                    {cellItems.map((item) =>
                      item.kind === "appointment" ? (
                        <AppointmentCard
                          key={`appointment-${item.id}-${item.date}`}
                          href={cardHref(item)}
                          item={item}
                          showProfessional={showProfessional}
                          withoutClosing={item.date < today && (item.status === "SCHEDULED" || item.status === "CONFIRMED" || item.status === "ARRIVED" || item.status === "IN_PROGRESS")}
                        />
                      ) : (
                        <BlockCard key={`block-${item.id}-${item.date}`} item={item} showProfessional={showProfessional} href={blockHref(item)} />
                      ),
                    )}
                    {slot && row.hour !== null ? <FreeSlot slot={slot} label={`${formatDayLabel(column.date)}, ${row.label}`} /> : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const WEEKDAY_HEADERS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTH_ITEMS = 3;

/** Month grid, Monday first; each day shows its first appointments and links to the day. */
export function MonthGrid({
  days,
  items,
  today,
  dayHref,
  cardHref,
}: {
  days: IsoDate[];
  items: AgendaItem[];
  today: IsoDate;
  dayHref: (date: IsoDate) => string;
  cardHref: (item: AppointmentItem) => string;
}) {
  const leading = (new Date(`${days[0]}T12:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (IsoDate | null)[] = [...Array<null>(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <section aria-label="Grade do mês" className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-7">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground">
            {label}
          </div>
        ))}
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="min-h-28 border-b border-l border-[#EEF1F0] bg-[#F8FAF9] first:border-l-0" />;
          const dayItems = items.filter((item) => item.date === day);
          const appointments = dayItems.filter((item): item is AppointmentItem => item.kind === "appointment");
          return (
            <div key={day} className="flex min-h-28 flex-col gap-1 border-b border-l border-[#EEF1F0] p-1.5">
              <Link href={dayHref(day)} prefetch={false} className={cn("w-fit rounded px-1 text-xs font-semibold hover:bg-muted", day === today && "bg-primary text-white hover:bg-primary")}>
                {Number(day.slice(8))}
              </Link>
              {appointments.slice(0, MONTH_ITEMS).map((item) => (
                <Link
                  key={item.id}
                  href={cardHref(item)}
                  scroll={false}
                  prefetch={false}
                  className={cn("truncate rounded px-1.5 py-0.5 text-[11px]", isCanceled(item.status) && "line-through opacity-70")}
                  style={{ background: tintOf(item.color), color: "#1A1F1E" }}
                >
                  {item.time} {item.patientName}
                </Link>
              ))}
              {appointments.length > MONTH_ITEMS ? (
                <Link href={dayHref(day)} className="px-1 text-[11px] font-medium text-primary hover:underline">
                  +{appointments.length - MONTH_ITEMS} mais
                </Link>
              ) : null}
              {dayItems.some((item) => item.kind === "block") ? <span className="px-1 text-[11px] text-muted-foreground">Com bloqueio</span> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Day list (PRD 4): visiting order, status, type and value, with one main action on
 * each row and the others in its menu (D-82).
 */
export function DayList({
  practiceId,
  items,
  cardHref,
  nextFor,
  showDate = false,
  emptyText,
}: {
  practiceId: string;
  items: AppointmentItem[];
  cardHref: (item: AppointmentItem) => string;
  nextFor: (item: AppointmentItem) => AppointmentStatus[];
  showDate?: boolean;
  emptyText: string;
}) {
  if (items.length === 0) return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="divide-y divide-[#EEF1F0]">
      {items.map((item) => (
        <li key={item.id} data-testid="day-list-item" className="flex flex-wrap items-center gap-x-3.5 gap-y-2 px-4 py-3 text-sm">
          <div className="w-12 font-semibold tabular-nums">
            {showDate ? <span className="block text-xs font-normal text-muted-foreground">{formatDateBr(item.date)}</span> : null}
            {item.time}
          </div>
          <div className="min-w-0 flex-[1_1_240px]">
            <Link href={cardHref(item)} scroll={false} prefetch={false} className={cn("font-semibold hover:underline", isCanceled(item.status) && "line-through")}>
              {item.patientName}
            </Link>
            <p className="flex flex-wrap items-center gap-x-1.5 text-[12.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: item.color }} />
                {item.typeName}
              </span>
              <span>· {item.professionalName}</span>
              <span>· {formatCents(item.priceCents, { compact: true })}</span>
            </p>
          </div>
          <StatusBadge status={item.status} noConfirmation={item.noConfirmation} />
          <div className="ml-auto flex min-w-44 justify-end">
            <QuickActions practiceId={practiceId} appointmentId={item.id} status={item.status} next={nextFor(item)} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function dayColumnLabel(day: IsoDate, today: IsoDate) {
  return (
    <>
      {formatDayLabel(day)}
      {day === today ? <span className="rounded-full bg-primary px-[7px] py-px text-[11px] text-white">hoje</span> : null}
    </>
  );
}
