import { CalendarDays, CalendarRange, Lock, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, linkClass } from "@/components/app-ui";
import { SignOutButton } from "@/components/sign-out-button";
import { isCanceled, StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { listProfessionalAccess } from "@/lib/auth/access";
import { getCurrentSession, requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { formatDayLabel, formatDateBr, formatLongDate, formatTime, toZoned } from "@/lib/dates/zoned";
import { CATEGORY_LABELS } from "@/lib/domain/labels";
import { formatCents } from "@/lib/domain/money";
import { vapidPublicKey } from "@/lib/push";
import { loadProfessionalDay, type ProfessionalDay } from "@/lib/pwa/today";
import { cn } from "@/lib/utils";
import { GoogleChangeActions } from "../../conta/[practiceId]/pendencias/_pendencias/change-actions";
import { ConnectionGate, ConnectionProvider, WhenCurrent } from "./_pwa/connection-gate";
import { DevicePanel } from "./_pwa/device-panel";
import { InstallHint } from "./_pwa/install-hint";
import { StatusActions } from "./_pwa/status-actions";

export const metadata: Metadata = { title: "Agenda do dia" };

type Appointment = ProfessionalDay["appointments"][number];

function initials(name: string) {
  const words = name.replace(/^(Dra?\.?)\s+/i, "").split(/\s+/).filter(Boolean);
  return `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`.toUpperCase();
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Next({ practiceId, item }: { practiceId: string; item: Appointment }) {
  const minutes = Math.round((item.endsAt.getTime() - item.startsAt.getTime()) / 60_000);
  return (
    <section aria-labelledby="proximo" className="flex flex-col gap-2">
      <h2 id="proximo" className="mt-1 text-xs font-semibold tracking-wide text-[#5B6663] uppercase">
        Próximo
      </h2>
      <div data-testid="next-appointment" className="flex flex-col gap-2 rounded-xl border-2 border-[#0F766E] bg-white p-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xl font-bold tabular-nums">{item.time}</span>
          <span className="rounded-full bg-[#EEF1F0] px-2 py-0.5 text-xs font-semibold text-[#3A4542]">{CATEGORY_LABELS[item.category]}</span>
          <StatusBadge status={item.status} noConfirmation={item.noConfirmation} className="ml-auto" />
        </div>
        <span className="text-base font-semibold">{item.patientName}</span>
        <span className="text-sm text-[#3A4542]">
          {item.typeName} · {minutes} min · {formatCents(item.priceCents, { compact: true })} · {item.locationName}
        </span>
        {item.noConfirmation ? <span className="text-xs text-[#5B6663]">O último pedido de confirmação ficou sem resposta.</span> : null}
        <StatusActions practiceId={practiceId} appointmentId={item.id} status={item.status} next={item.next} primary />
        <Link href={`/conta/${practiceId}/agendamentos/${item.id}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-11")}>
          Ver histórico
        </Link>
      </div>
    </section>
  );
}

function Row({ practiceId, item }: { practiceId: string; item: Appointment }) {
  const canceled = isCanceled(item.status) || item.status === "RESCHEDULED";
  return (
    <li data-testid="day-row" className={cn("flex flex-col gap-2 rounded-xl border border-[#E3E8E6] border-l-4 bg-white px-3.5 py-3", canceled && "opacity-70")} style={{ borderLeftColor: canceled ? "#DC2626" : item.color }}>
      <div className="flex gap-3">
        <span className="w-11 shrink-0 text-sm font-bold tabular-nums">{item.time}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={cn("truncate text-sm font-semibold", canceled && "line-through")}>{item.patientName}</span>
          <span className="truncate text-xs text-[#3A4542]">
            {item.typeName}
            {canceled ? "" : ` · ${formatCents(item.priceCents, { compact: true })}`}
          </span>
        </div>
        <StatusBadge status={item.status} noConfirmation={item.noConfirmation} />
      </div>
      <StatusActions practiceId={practiceId} appointmentId={item.id} status={item.status} next={item.next} />
    </li>
  );
}

function GoogleChanges({ practiceId, day, canOverbook }: { practiceId: string; day: ProfessionalDay; canOverbook: boolean }) {
  const when = (instant: Date, timeZone: string) => {
    const { date } = toZoned(instant, timeZone);
    return `${formatDayLabel(date)} · ${formatDateBr(date)} ${formatTime(instant, timeZone)}`;
  };
  return (
    <section aria-label="Pendências do Google Agenda" data-testid="google-pending" className="flex flex-col gap-2 rounded-xl border border-[#FCD9A6] bg-[#FEF3E2] p-3 text-[#92400E]">
      <p className="text-sm">
        <strong>Google Agenda:</strong> {day.googleChanges.length === 1 ? "1 alteração esperando sua decisão." : `${day.googleChanges.length} alterações esperando sua decisão.`}
      </p>
      <ul className="flex flex-col gap-3">
        {day.googleChanges.map((change) => (
          <li key={change.id} className="flex flex-col gap-1.5 rounded-lg bg-white p-2.5 text-xs text-[#1A1F1E]">
            <span className="font-semibold">{change.patientName}</span>
            <span>Marcado para {when(change.startsAt, change.timeZone)}</span>
            <span>{change.kind === "DELETED" || !change.proposedStartsAt ? "Excluído no Google" : `Movido no Google para ${when(change.proposedStartsAt, change.timeZone)}`}</span>
            <GoogleChangeActions practiceId={practiceId} changeId={change.id} canOverbook={canOverbook} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The professional's phone (PRD 11, mockup "PWA do profissional", D-76): the day, the next
 * appointment, what waits in Google and marking the arrival. Always the person's own agenda.
 * Without a connection the agenda leaves the screen, and nothing of it is stored (D-76).
 */
export default async function ProfessionalDayPage({ params }: PageProps<"/pwa/[practiceId]">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, ["agenda:view", "agenda:view-own"]);
  const [day, current, practices] = await Promise.all([loadProfessionalDay(context), getCurrentSession(), listProfessionalAccess(context.user.id)]);

  if (!day) {
    return (
      <AuthCard title="Esta tela é do profissional" subtitle={context.access.practiceName}>
        <p className="text-sm text-zinc-700">
          Seu usuário não está ligado a um profissional desta conta. A agenda da conta continua{" "}
          <Link href={`/conta/${practiceId}`} className={linkClass}>
            no site
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  const next = day.appointments.find((item) => item.id === day.next);
  const rest = day.appointments.filter((item) => item.id !== day.next);
  const { role } = context.access;
  const links = [
    { href: `/pwa/${practiceId}`, label: "Hoje", icon: CalendarDays, active: true },
    { href: `/conta/${practiceId}?visao=semana`, label: "Semana", icon: CalendarRange, active: false },
    ...(can(role, "time-blocks:manage") || can(role, "time-blocks:manage-own") ? [{ href: `/pwa/${practiceId}/bloquear`, label: "Bloquear", icon: Lock, active: false }] : []),
    ...(can(role, "google:link-own") ? [{ href: `/conta/${practiceId}/perfil`, label: "Perfil", icon: UserRound, active: false }] : []),
  ];

  return (
    <ConnectionProvider renderedAt={day.renderedAt.getTime()}>
      <header className="relative flex flex-col gap-3.5 bg-[#0F766E] px-4 pt-4 pb-4 text-white">
        <div className="flex items-center gap-3">
          <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-white font-bold text-[#0F766E]">
            {initials(day.professionalName)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-xs opacity-85">{capitalize(formatLongDate(day.today))}</span>
            <h1 className="truncate text-[17px] font-semibold">{day.professionalName}</h1>
          </div>
          <DevicePanel remembered={Boolean(current?.session.rememberedDevice)} vapidPublicKey={vapidPublicKey()} />
        </div>
        <WhenCurrent>
          <dl className="grid grid-cols-3 gap-2">
            {[
              { label: "Hoje", value: String(day.counts.total), id: "total" },
              { label: "Confirmados", value: String(day.counts.confirmed), id: "confirmed" },
              { label: "Previsto", value: formatCents(day.predictedCents, { compact: true }), id: "predicted" },
            ].map((stat) => (
              <div key={stat.id} className="flex flex-col gap-0.5 rounded-lg bg-white/15 p-2.5">
                <dt className="text-[11px] opacity-85">{stat.label}</dt>
                <dd data-testid={`day-${stat.id}`} className="text-lg font-bold">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </WhenCurrent>
      </header>

      <main className="flex flex-1 flex-col gap-3 px-4 py-4">
        <ConnectionGate>
          <div className="flex flex-col gap-3">
            {day.googleChanges.length > 0 ? <GoogleChanges practiceId={practiceId} day={day} canOverbook={can(role, "appointments:overbook")} /> : null}
            {next ? <Next practiceId={practiceId} item={next} /> : null}
            <section aria-labelledby="resto-do-dia" className="flex flex-col gap-2">
              <h2 id="resto-do-dia" className="mt-1 text-xs font-semibold tracking-wide text-[#5B6663] uppercase">
                {next ? "Resto do dia" : "Hoje"}
              </h2>
              {rest.length === 0 && day.blocks.length === 0 ? (
                <p className="rounded-xl border border-[#E3E8E6] bg-white px-4 py-3 text-sm text-[#5B6663]">{next ? "Nada mais marcado para hoje." : "Nada marcado para hoje."}</p>
              ) : null}
              <ul className="flex flex-col gap-2">
                {rest.map((item) => (
                  <Row key={item.id} practiceId={practiceId} item={item} />
                ))}
                {day.blocks.map((block) => (
                  <li key={block.id} className="flex gap-3 rounded-xl border border-dashed border-[#B8C2BE] bg-white px-3.5 py-3 text-sm text-[#5B6663]">
                    <span className="w-11 shrink-0 font-bold tabular-nums">{block.allDay ? "Dia" : block.time}</span>
                    <span>{block.source === "GOOGLE" ? "Compromisso do Google" : (block.reason ?? "Bloqueio")}</span>
                  </li>
                ))}
              </ul>
            </section>
            <p className="text-center text-xs text-[#5B6663]">Atualizado às {formatTime(day.renderedAt, day.timeZone)}</p>
          </div>
        </ConnectionGate>
        <InstallHint />
        <div className="flex items-center justify-center gap-4 text-sm text-[#3A4542]">
          {practices.length > 1 ? (
            <Link href="/pwa" className="underline">
              Trocar de conta
            </Link>
          ) : null}
          <Link href="/seguranca" className="underline">
            Segurança
          </Link>
          <SignOutButton className="text-sm underline" />
        </div>
      </main>

      <nav aria-label="Telas do app" className="sticky bottom-0 flex border-t border-[#E3E8E6] bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {links.map(({ href, label, icon: Icon, active }) => (
          <Link key={label} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 flex-1 flex-col items-center gap-1 text-[11px]", active ? "font-semibold text-[#0F766E]" : "text-[#5B6663]")}>
            <Icon aria-hidden className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </ConnectionProvider>
  );
}
