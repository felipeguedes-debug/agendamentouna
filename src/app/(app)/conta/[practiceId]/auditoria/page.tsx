import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AUDIT_AREAS, AUDIT_PERIODS, type AuditArea, type AuditPeriod } from "@/lib/audit/labels";
import { auditPeople, listAuditEvents } from "@/lib/audit/trail";
import { requirePracticePermission } from "@/lib/auth/guard";
import { AuditFilters } from "./_auditoria/audit-filters";

export const metadata: Metadata = { title: "Trilha de auditoria" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/** Trilha de auditoria (PRD 3, req. 4; D-87): quem fez o quê nesta conta. Filters in the URL. */
export default async function AuditPage({ params, searchParams }: PageProps<"/conta/[practiceId]/auditoria">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "audit:view");
  const query = await searchParams;
  const period = first(query.periodo);
  const area = first(query.area);
  const filters = {
    period: AUDIT_PERIODS.includes(period as AuditPeriod) ? (period as AuditPeriod) : ("7d" as const),
    who: first(query.quem) || null,
    area: AUDIT_AREAS.includes(area as AuditArea) ? (area as AuditArea) : null,
    page: Number(first(query.pagina)) || 1,
  };
  const [list, people] = await Promise.all([listAuditEvents(context, filters), auditPeople(context)]);
  const base = `/conta/${practiceId}/auditoria`;
  const pageHref = (page: number) =>
    `${base}?${new URLSearchParams({ periodo: filters.period, ...(filters.who ? { quem: filters.who } : {}), ...(filters.area ? { area: filters.area } : {}), pagina: String(page) })}`;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/conta/${practiceId}/configuracoes`} className="inline-flex items-center gap-1 self-start text-[13px] text-muted-foreground hover:underline">
        <ChevronLeft aria-hidden className="size-3.5" />
        Configurações
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Trilha de auditoria</h1>
        <p className="text-[13.5px] text-muted-foreground">Quem fez o quê nesta conta. Os registros não podem ser alterados e guardam só o nome dos campos, nunca o valor.</p>
      </div>
      <section className="overflow-hidden rounded-xl border border-border bg-white">
        <AuditFilters base={base} period={filters.period} who={filters.who} area={filters.area} people={people} />
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
              <TableHead className="px-4">Quando</TableHead>
              <TableHead>Quem</TableHead>
              <TableHead>O que aconteceu</TableHead>
              <TableHead>Onde</TableHead>
              <TableHead className="px-4">Campos alterados</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Nenhum registro com estes filtros.
                </TableCell>
              </TableRow>
            ) : null}
            {list.items.map((row) => (
              <TableRow key={row.id} data-testid="audit-row">
                <TableCell className="px-4 py-2.5 whitespace-nowrap tabular-nums">{row.when}</TableCell>
                <TableCell>
                  <span className="block font-medium">{row.who}</span>
                  {row.detail ? <span className="text-[12.5px] text-muted-foreground">{row.detail}</span> : null}
                </TableCell>
                <TableCell>{row.what}</TableCell>
                <TableCell>
                  {row.href ? (
                    <Link href={row.href} className="text-primary hover:underline">
                      {row.where}
                    </Link>
                  ) : (
                    row.where
                  )}
                </TableCell>
                <TableCell className="px-4 whitespace-normal text-[#3A4542]">{row.fields || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {list.pages > 1 ? (
          <nav aria-label="Páginas" className="flex items-center justify-center gap-3 border-t border-[#EEF1F0] p-3 text-[13px]">
            {list.page > 1 ? (
              <Link href={pageHref(list.page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Anterior
              </Link>
            ) : null}
            <span className="text-muted-foreground">
              Página {list.page} de {list.pages}
            </span>
            {list.page < list.pages ? (
              <Link href={pageHref(list.page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
                Próxima
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
