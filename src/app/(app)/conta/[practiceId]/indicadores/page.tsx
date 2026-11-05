import type { Metadata } from "next";
import { AlertTriangle, Check, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { addDays, formatDateBr, todayIn } from "@/lib/dates/zoned";
import { formatCents } from "@/lib/domain/money";
import { loadIndicators, loadOrganizationIndicators } from "@/lib/indicators/indicators";
import { INDICATOR_PERIODS, parseIndicatorPeriod, targetStatus, type IndicatorKey } from "@/lib/indicators/rules";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Indicadores" };

const NO_DATA = "Sem dados";

function percent(value: number | null) {
  return value === null ? NO_DATA : new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

function count(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function hours(minutes: number) {
  const whole = Math.round(minutes);
  const rest = whole % 60;
  return rest === 0 ? `${count(whole / 60)} h` : `${count(Math.floor(whole / 60))} h ${rest} min`;
}

type Status = ReturnType<typeof targetStatus>;

const STATUS: Record<Status, { label: string; icon: typeof Check; className: string }> = {
  on_target: { label: "Na meta", icon: Check, className: "bg-[#E6F4F1] text-[#0F766E]" },
  off_target: { label: "Fora da meta", icon: AlertTriangle, className: "bg-[#FEF3E2] text-[#92400E]" },
  no_data: { label: NO_DATA, icon: Minus, className: "bg-[#EEF1F0] text-[#3A4542]" },
  no_target: { label: "Acompanhar", icon: Minus, className: "bg-[#EEF1F0] text-[#3A4542]" },
};

/** The state beside the number, always with an icon and a word (never color alone). */
function StatusTag({ status, label }: { status: Status; label?: string }) {
  const { label: text, icon: Icon, className } = STATUS[status];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap", className)}>
      <Icon aria-hidden className="size-3" />
      {label ?? text}
    </span>
  );
}

function Tile({
  id,
  label,
  value,
  detail,
  target,
  status,
  statusLabel,
  large,
}: {
  id: IndicatorKey;
  label: string;
  value: string;
  detail: ReactNode;
  target: string;
  status: Status;
  statusLabel?: string;
  large?: boolean;
}) {
  const empty = value === NO_DATA;
  return (
    <div data-testid={`indicator-${id}`} className={cn("flex flex-col gap-2 rounded-xl border border-border bg-white px-4 py-3.5", large && "sm:col-span-2 lg:col-span-3")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-sm font-medium text-[#3A4542]">{label}</h2>
        <StatusTag status={status} label={statusLabel} />
      </div>
      <p data-testid="value" className={cn(empty ? "font-semibold text-muted-foreground" : "font-bold", large ? (empty ? "text-3xl" : "text-5xl") : empty ? "text-xl" : "text-2xl")}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{detail}</p>
      <p className="mt-auto text-xs text-muted-foreground">Meta em 90 dias: {target}</p>
    </div>
  );
}

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-xl border border-border bg-white">{children}</div>
    </section>
  );
}

const weekRange = (week: { start: string; endExclusive: string }) => `de ${formatDateBr(week.start)} a ${formatDateBr(addDays(week.endExclusive, -1))}`;

/** Indicators of PRD 8 for one practice (D-74), over the last days of the period chosen in the URL. */
export default async function IndicatorsPage({ params, searchParams }: PageProps<"/conta/[practiceId]/indicadores">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "reports:practice");
  const today = todayIn(await agendaTimeZone(context.db));
  const period = parseIndicatorPeriod(await searchParams, today);
  const indicators = await loadIndicators(context, period);
  const organization = can(context.access.role, "reports:consolidated") ? await loadOrganizationIndicators(context, period) : null;
  const { noShow, realization, autoConfirmation, confirmationWork: work, googleCoverage, syncFailures, delivery, occupancy, adoption } = indicators;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Indicadores</h1>
          <p className="text-sm text-muted-foreground">
            De {formatDateBr(period.start)} a {formatDateBr(addDays(period.endExclusive, -1))}, com o dia de hoje incluído.
          </p>
        </div>
        <nav aria-label="Período" className="flex gap-0.5 rounded-lg bg-[#E3E8E6] p-[3px]">
          {INDICATOR_PERIODS.map((days) => (
            <Link
              key={days}
              href={`/conta/${practiceId}/indicadores?dias=${days}`}
              aria-current={days === period.days ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium text-[#3A4542]", days === period.days && "bg-white font-semibold text-foreground shadow-xs")}
            >
              {days} dias
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          id="noShow"
          large
          label="Taxa de falta"
          value={percent(noShow.rate.value)}
          status={targetStatus("noShow", noShow.rate.value)}
          target="abaixo de 10%"
          detail={
            <>
              Faltas: {count(noShow.noShow)}. Atendidos: {count(noShow.completed)}.{" "}
              <strong data-testid="without-closing" className="font-semibold text-[#92400E]">
                {count(noShow.withoutClosing)} sem baixa
              </strong>
              , fora da taxa até alguém dar baixa.
            </>
          }
        />
        <Tile
          id="autoConfirmation"
          label="Confirmação automática"
          value={percent(autoConfirmation.value)}
          status={targetStatus("autoConfirmation", autoConfirmation.value)}
          target="acima de 70%"
          detail={
            autoConfirmation.denominator === 0
              ? "A régua não teve a quem perguntar no período."
              : `Confirmados pelo WhatsApp: ${count(autoConfirmation.numerator)} de ${count(autoConfirmation.denominator)} que a régua podia perguntar.`
          }
        />
        <Tile
          id="confirmationTime"
          label="Tempo da secretária em confirmação"
          value={work.minutesPerDay === null ? NO_DATA : `${count(Math.round(work.minutesPerDay))} min por dia`}
          status={targetStatus("confirmationTime", work.dropRate)}
          statusLabel={work.minutesPerDay !== null && work.dropRate === null ? "Ainda sem comparação" : undefined}
          target="queda de 60% frente ao início"
          detail={
            <>
              {work.minutesPerDay === null
                ? "A medição começa quando alguém trabalha a lista Sem confirmação."
                : work.dropRate === null
                  ? `Medido em ${count(work.measuredDays)} dias do período. A comparação com o início aparece depois de 14 dias de medição.`
                  : `Queda de ${percent(work.dropRate)} frente aos primeiros dias (${count(Math.round(work.baselinePerDay ?? 0))} min por dia).`}{" "}
              Contatos manuais no período: {count(work.manualContacts)}.
            </>
          }
        />
        <Tile
          id="googleCoverage"
          label="Cobertura de Google Agenda"
          value={percent(googleCoverage.value)}
          status={targetStatus("googleCoverage", googleCoverage.value)}
          target="acima de 80%"
          detail={`Com vínculo ativo hoje: ${count(googleCoverage.numerator)} de ${count(googleCoverage.denominator)} profissionais.`}
        />
        <Tile
          id="syncFailures"
          label="Falhas de sincronização"
          value={percent(syncFailures.value)}
          status={targetStatus("syncFailures", syncFailures.value)}
          target="abaixo de 0,5%"
          detail={
            syncFailures.denominator === 0
              ? "Nenhum evento foi exportado para o Google no período."
              : `Com erro: ${count(syncFailures.numerator)} de ${count(syncFailures.denominator)} eventos exportados para o Google.`
          }
        />
        <Tile
          id="delivery"
          label="Entrega de WhatsApp"
          value={percent(delivery.rate.value)}
          status={targetStatus("delivery", delivery.rate.value)}
          target="acima de 95%"
          detail={`${
            delivery.rate.denominator === 0 ? "Nenhuma mensagem saiu no período." : `Entregues: ${count(delivery.rate.numerator)} de ${count(delivery.rate.denominator)} enviadas.`
          }${delivery.neverSent > 0 ? ` Não chegaram a sair: ${count(delivery.neverSent)}.` : ""}`}
        />
        <Tile
          id="occupancy"
          label="Ocupação da agenda"
          value={percent(occupancy.total.rate.value)}
          status={targetStatus("occupancy", occupancy.total.rate.value)}
          target="acompanhar; meta por conta"
          detail={
            occupancy.total.availableMinutes === 0
              ? "Nenhum horário de atendimento cadastrado no período."
              : `Ocupadas: ${hours(occupancy.total.occupiedMinutes)} de ${hours(occupancy.total.availableMinutes)} disponíveis.`
          }
        />
        <Tile
          id="realization"
          label="Valor realizado ÷ previsto"
          value={percent(realization.rate.value)}
          status={targetStatus("realization", realization.rate.value)}
          target="acima de 85%"
          detail={`Realizado: ${formatCents(realization.realizedCents)} de ${formatCents(realization.predictedCents)} previstos. Sem baixa: ${formatCents(realization.withoutClosingCents)}.`}
        />
        <Tile
          id="adoption"
          label="Adoção da conta"
          value={adoption.days === null ? NO_DATA : `${count(adoption.days)} ${adoption.days === 1 ? "dia" : "dias"} de uso`}
          status={adoption.days === null ? "no_data" : adoption.days >= adoption.minDays ? "on_target" : "off_target"}
          target={organization ? "acima de 90% das contas" : `${adoption.minDays} ou mais dias na semana`}
          detail={adoption.days === null ? "Ninguém registrou uma ação nesta conta ainda." : `Na semana ${weekRange(adoption.week)}, de segunda a sábado.`}
        />
      </div>

      <Section id="falta-por-tipo" title="Falta por tipo de atendimento" description="Sem baixa fica de fora da taxa e aparece à parte.">
        <Table>
          <TableHeader>
            <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
              <TableHead className="px-4">Tipo</TableHead>
              <TableHead className="text-right">Atendidos</TableHead>
              <TableHead className="text-right">Faltaram</TableHead>
              <TableHead className="text-right">Taxa de falta</TableHead>
              <TableHead className="pr-4 text-right">Sem baixa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {indicators.noShowByType.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="px-4 text-muted-foreground">
                  {NO_DATA}: nenhum atendimento com baixa no período.
                </TableCell>
              </TableRow>
            ) : null}
            {indicators.noShowByType.map((row) => (
              <TableRow key={row.typeId} data-testid="no-show-row">
                <TableCell className="px-4 font-medium">{row.typeName}</TableCell>
                <TableCell className="text-right tabular-nums">{count(row.completed)}</TableCell>
                <TableCell className="text-right tabular-nums">{count(row.noShow)}</TableCell>
                <TableCell className="text-right tabular-nums">{percent(row.rate.value)}</TableCell>
                <TableCell className="pr-4 text-right tabular-nums">{count(row.withoutClosing)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section id="ocupacao" title="Ocupação por profissional" description="Horário de atendimento sem exceções e bloqueios. O que fica fora dele não conta. Falta e cancelamento liberam o horário.">
        <Table>
          <TableHeader>
            <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
              <TableHead className="px-4">Profissional</TableHead>
              <TableHead className="text-right">Ocupadas</TableHead>
              <TableHead className="text-right">Disponíveis</TableHead>
              <TableHead className="pr-4 text-right">Ocupação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {occupancy.byProfessional.map((row) => (
              <TableRow key={row.id} data-testid="occupancy-row">
                <TableCell className="px-4 font-medium">{row.name}</TableCell>
                <TableCell className="text-right tabular-nums">{hours(row.occupiedMinutes)}</TableCell>
                <TableCell className="text-right tabular-nums">{hours(row.availableMinutes)}</TableCell>
                <TableCell className="pr-4 text-right tabular-nums">{percent(row.rate.value)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      {organization ? (
        <Section
          id="organizacao"
          title={`Contas da organização: ${percent(organization.adoption.value)} com ${organization.minDays} ou mais dias de uso`}
          description={`${count(organization.adoption.numerator)} de ${count(organization.adoption.denominator)} contas em uso. Quem nunca usou aparece como "sem dados" e fica de fora desse cálculo.`}
        >
          <Table>
            <TableHeader>
              <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
                <TableHead className="px-4">Conta</TableHead>
                <TableHead className="text-right">Taxa de falta</TableHead>
                <TableHead className="text-right">Sem baixa</TableHead>
                <TableHead className="pr-4 text-right">Dias de uso na semana passada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organization.practices.map((row) => (
                <TableRow key={row.practiceId} data-testid="organization-row">
                  <TableCell className="px-4 font-medium">
                    <Link href={`/conta/${row.practiceId}/indicadores?dias=${period.days}`} className="text-primary hover:underline">
                      {row.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{percent(row.noShow.rate.value)}</TableCell>
                  <TableCell className="text-right tabular-nums">{count(row.noShow.withoutClosing)}</TableCell>
                  <TableCell className="pr-4 text-right tabular-nums">{row.days === null ? NO_DATA : count(row.days)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      ) : null}
    </div>
  );
}
