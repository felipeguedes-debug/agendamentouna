import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { addDays, formatDateBr, formatTime, todayIn, toZoned } from "@/lib/dates/zoned";
import { DISPATCH_REASON_LABELS } from "@/lib/domain/labels";
import { INDICATOR_PERIODS, parseIndicatorPeriod } from "@/lib/indicators/rules";
import { loadOrganizationHealth, loadPracticeHealth, type PracticeHealth } from "@/lib/observability/health";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Saúde da operação" };

const NO_DATA = "Sem dados";

function percent(value: number | null) {
  return value === null ? NO_DATA : new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(value);
}

const CRM_STATUS: Record<PracticeHealth["crm"]["status"], string> = { none: "Não conectada", active: "Conectada", revoked: "Token recusado" };

const ERROR_SOURCES: Record<string, string> = { render: "Tela", route: "Rota", action: "Ação", proxy: "Proxy", job: "Fila" };

function Card({ title, value, children }: { title: string; value: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-white px-4 py-3.5">
      <h2 className="text-sm font-medium text-[#3A4542]">{title}</h2>
      <p className={cn(value === NO_DATA ? "text-xl font-semibold text-muted-foreground" : "text-2xl font-bold")}>{value}</p>
      <div className="text-xs text-muted-foreground">{children}</div>
    </div>
  );
}

/** The internal panel of PRD 7 (D-101): whether the operation is working, not how the practice is doing (PRD 8). */
export default async function HealthPage({ params, searchParams }: PageProps<"/conta/[practiceId]/saude">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "reports:practice");
  const timeZone = await agendaTimeZone(context.db);
  const period = parseIndicatorPeriod(await searchParams, todayIn(timeZone));
  const [health, organization] = await Promise.all([loadPracticeHealth(context.db, period), can(context.access.role, "reports:consolidated") ? loadOrganizationHealth(context, period) : null]);
  const { delivery, dispatchFailures, instances, google, crm, serverErrors } = health;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Saúde da operação</h1>
          <p className="text-sm text-muted-foreground">
            De {formatDateBr(period.start)} a {formatDateBr(addDays(period.endExclusive, -1))}. Filas e conexões são de agora.
          </p>
        </div>
        <nav aria-label="Período" className="flex gap-0.5 rounded-lg bg-[#E3E8E6] p-[3px]">
          {INDICATOR_PERIODS.map((days) => (
            <Link
              key={days}
              href={`/conta/${practiceId}/saude?dias=${days}`}
              aria-current={days === period.days ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium text-[#3A4542]", days === period.days && "bg-white font-semibold text-foreground shadow-xs")}
            >
              {days} dias
            </Link>
          ))}
        </nav>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Entrega de WhatsApp" value={percent(delivery.rate.value)}>
          {delivery.rate.numerator} entregues de {delivery.rate.denominator} enviadas. {delivery.neverSent} não saíram.
        </Card>
        <Card title="Instâncias de WhatsApp" value={`${instances.connected} de ${instances.professionals}`}>
          conectadas. {instances.notConnected} sem conexão e {instances.withoutInstance} sem instância.
        </Card>
        <Card title="Falhas no Google" value={percent(google.failures.value)}>
          {google.failures.numerator} de {google.failures.denominator} eventos. {google.waiting} na fila e {google.revokedLinks} {google.revokedLinks === 1 ? "vínculo desconectado" : "vínculos desconectados"}.
        </Card>
        <Card title="SynkronosCRM" value={CRM_STATUS[crm.status]}>
          {crm.failed} com falha e {crm.waiting} na fila.
        </Card>
      </div>

      <section aria-labelledby="falhas-whatsapp" className="flex flex-col gap-2">
        <h2 id="falhas-whatsapp" className="text-base font-semibold">
          Mensagens que não saíram
        </h2>
        <div className="rounded-xl border border-border bg-white">
          {dispatchFailures.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nenhuma no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Mensagens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatchFailures.map((row) => (
                  <TableRow key={row.reason}>
                    <TableCell>{DISPATCH_REASON_LABELS[row.reason] ?? row.reason}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section aria-labelledby="erros" className="flex flex-col gap-2">
        <h2 id="erros" className="text-base font-semibold">
          Erros do sistema
        </h2>
        <p className="text-xs text-muted-foreground">Onde aconteceu e de que tipo, sem o texto do erro. O detalhe fica no log da hospedagem, procurando pelo código.</p>
        <div className="rounded-xl border border-border bg-white">
          {serverErrors.groups.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">Nenhum no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Onde</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Último</TableHead>
                  <TableHead className="text-right">Vezes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serverErrors.groups.map((row) => (
                  <TableRow key={`${row.source}-${row.route}-${row.errorName}`}>
                    <TableCell>
                      {ERROR_SOURCES[row.source] ?? row.source}: {row.route}
                    </TableCell>
                    <TableCell>{row.errorName}</TableCell>
                    <TableCell>{row.lastAt ? `${formatDateBr(toZoned(row.lastAt, timeZone).date)} às ${formatTime(row.lastAt, timeZone)}` : ""}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {organization ? (
        <section aria-labelledby="por-conta" className="flex flex-col gap-2">
          <h2 id="por-conta" className="text-base font-semibold">
            Por conta da organização
          </h2>
          <div className="rounded-xl border border-border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead>Sem conexão</TableHead>
                  <TableHead>Falhas no Google</TableHead>
                  <TableHead>Falhas no CRM</TableHead>
                  <TableHead>Erros</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organization.practices.map((row) => (
                  <TableRow key={row.practiceId}>
                    <TableCell>
                      <Link href={`/conta/${row.practiceId}/saude?dias=${period.days}`} className="text-primary hover:underline">
                        {row.name}
                      </Link>
                    </TableCell>
                    <TableCell>{percent(row.health.delivery.rate.value)}</TableCell>
                    <TableCell>{row.health.instances.notConnected}</TableCell>
                    <TableCell>{percent(row.health.google.failures.value)}</TableCell>
                    <TableCell>{row.health.crm.failed}</TableCell>
                    <TableCell>{row.health.serverErrors.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
