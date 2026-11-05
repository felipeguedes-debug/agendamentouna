import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { requirePracticePermission } from "@/lib/auth/guard";
import { formatDateBr, formatTime, toZoned } from "@/lib/dates/zoned";
import { listProfessionalsGoogle, type GoogleLinkStatus } from "@/lib/google/profile";
import { listLocations } from "@/lib/locations/locations";
import { listTeam } from "@/lib/professionals/professionals";
import { cn } from "@/lib/utils";
import { AddProfessionalPanel } from "./_profissionais/add-professional-panel";

export const metadata: Metadata = { title: "Profissionais" };

const STATUS_TEXT: Record<GoogleLinkStatus, string> = {
  none: "Não vinculado",
  active: "Vinculado",
  revoked: "Desconectado",
  error: "Com erro",
};

/**
 * The practice's professionals (PRD 11, "Perfil do profissional"; D-23, D-91), for the
 * manager: who attends and where, adding someone new, who still has to authorize Google,
 * and the links Google revoked (PRD 5, rule 6).
 */
export default async function ProfessionalsPage({ params, searchParams }: PageProps<"/conta/[practiceId]/profissionais">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, ["google:send-link", "practice-settings:edit"]);
  const [team, google, locations, timeZone] = await Promise.all([listTeam(context), listProfessionalsGoogle(context), listLocations(context), agendaTimeZone(context.db)]);
  const googleById = new Map(google.map((row) => [row.id, row]));
  const base = `/conta/${practiceId}/profissionais`;
  const adding = (await searchParams).novo === "1";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="text-xl font-semibold">Profissionais</h1>
          <p className="text-sm text-muted-foreground">Quem atende e onde. No Google Agenda, quem autoriza é sempre o profissional, com a conta Google dele.</p>
        </div>
        <Link href={`${base}?novo=1`} scroll={false} className={cn(buttonVariants({ size: "lg" }), "bg-accent text-accent-foreground hover:bg-accent/70")}>
          <Plus aria-hidden />
          Adicionar profissional
        </Link>
      </div>
      <div className="rounded-xl border border-border bg-white">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
              <TableHead className="px-4">Profissional</TableHead>
              <TableHead>Unidades</TableHead>
              <TableHead>Google Agenda</TableHead>
              <TableHead>Última leitura</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.map((row) => {
              const link = googleById.get(row.id);
              return (
                <TableRow key={row.id} data-testid="professional-row">
                  <TableCell className="px-4">
                    <Link href={`${base}/${row.id}`} className="font-medium text-primary hover:underline">
                      {row.name}
                    </Link>
                    {row.active ? null : <span className="block text-xs font-medium text-muted-foreground">Inativo</span>}
                    {row.hasLogin ? null : <span className="block text-xs text-muted-foreground">Sem login</span>}
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal">{row.locations.join(", ") || "—"}</TableCell>
                  <TableCell>
                    {link ? (
                      <>
                        <span className={cn(link.status === "revoked" || link.status === "error" ? "font-medium text-destructive" : link.status === "active" ? "text-primary" : "text-muted-foreground")}>
                          {STATUS_TEXT[link.status]}
                        </span>
                        {link.email ? <span className="block text-xs text-muted-foreground">{link.email}</span> : null}
                        {link.syncing ? <span className="block text-xs text-muted-foreground">Criando o calendário no Google…</span> : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {link?.lastSyncAt ? `${formatDateBr(toZoned(link.lastSyncAt, timeZone).date)} ${formatTime(link.lastSyncAt, timeZone)}` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {adding ? <AddProfessionalPanel practiceId={practiceId} closeHref={base} locations={locations.filter((location) => location.active).map(({ id, name }) => ({ id, name }))} /> : null}
    </div>
  );
}
