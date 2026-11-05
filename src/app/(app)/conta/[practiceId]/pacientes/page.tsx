import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { agendaTimeZone } from "@/lib/agenda/agenda";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { formatDateBr, toZoned } from "@/lib/dates/zoned";
import { listPatients } from "@/lib/patients/patients";
import { cn } from "@/lib/utils";
import { ConsentBadge } from "./_pacientes/consent-badge";
import { AddPatientPanel } from "./_pacientes/add-patient-panel";
import { PatientListSearch } from "./_pacientes/patient-list-search";

export const metadata: Metadata = { title: "Pacientes" };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * "Pacientes" (PRD 11, D-50): list by name with the search as you type, the consent of
 * each one and, for those who book, Agendar on the row and a new patient (D-82, D-89).
 */
export default async function PatientsPage({ params, searchParams }: PageProps<"/conta/[practiceId]/pacientes">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "patients:view");
  const { role } = context.access;
  const query = await searchParams;
  const term = (first(query.busca) ?? "").trim();
  const requestedPage = Number(first(query.pagina) ?? "1");
  const [list, timeZone] = await Promise.all([
    listPatients(context, { term, page: Number.isInteger(requestedPage) ? requestedPage : 1 }),
    agendaTimeZone(context.db),
  ]);
  const base = `/conta/${practiceId}/pacientes`;
  const canBook = can(role, "appointments:manage");
  const listHref = `${base}${term ? `?${new URLSearchParams({ busca: term })}` : ""}`;
  const pageHref = (page: number) => `${base}?${new URLSearchParams({ ...(term ? { busca: term } : {}), pagina: String(page) })}`;
  const day = (instant: Date) => formatDateBr(toZoned(instant, timeZone).date);
  const adding = canBook && first(query.novo) === "1";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <h1 className="text-xl font-semibold">Pacientes</h1>
        <span className="text-[13px] text-muted-foreground" data-testid="patients-total">
          {term ? `${list.total} encontrado${list.total === 1 ? "" : "s"} para "${term}"` : `${list.total} paciente${list.total === 1 ? "" : "s"}`}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {can(role, "patients:import") ? (
            <Link href={`${base}/importar`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Importar planilha
            </Link>
          ) : null}
          {canBook ? (
            <Link href={`${listHref}${term ? "&" : "?"}novo=1`} scroll={false} className={cn(buttonVariants({ size: "lg" }), "bg-accent text-accent-foreground hover:bg-accent/70")}>
              <Plus aria-hidden />
              Adicionar paciente
            </Link>
          ) : null}
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="border-b border-[#EEF1F0] px-4 py-3.5">
          <PatientListSearch base={base} term={term} />
        </div>
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
              <TableHead className="px-4">Paciente</TableHead>
              <TableHead>Celular</TableHead>
              <TableHead>WhatsApp</TableHead>
              <TableHead>Último atendimento</TableHead>
              <TableHead>Próximo agendamento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  {term ? "Nenhum paciente encontrado." : "Nenhum paciente cadastrado."}
                </TableCell>
              </TableRow>
            ) : null}
            {list.items.map((patient) => (
              <TableRow key={patient.id} data-testid="patient-row">
                <TableCell className="px-4 py-2.5">
                  <Link href={`${base}/${patient.id}`} className="block font-semibold hover:underline">
                    {patient.name}
                  </Link>
                  <span className="text-[12.5px] text-muted-foreground">{patient.insurance}</span>
                </TableCell>
                <TableCell className="tabular-nums">{patient.phone || "—"}</TableCell>
                <TableCell>
                  <ConsentBadge state={patient.consent} />
                </TableCell>
                <TableCell>{patient.lastVisitAt ? day(patient.lastVisitAt) : "—"}</TableCell>
                <TableCell>
                  {patient.nextAppointmentAt ? (
                    `${day(patient.nextAppointmentAt)} ${toZoned(patient.nextAppointmentAt, timeZone).time}`
                  ) : canBook ? (
                    <Link href={`/conta/${practiceId}/agendamentos/novo?paciente=${patient.id}`} prefetch={false} className="inline-flex items-center gap-1 font-semibold text-primary">
                      <Plus aria-hidden className="size-3.5" />
                      Agendar
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
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

      {adding ? <AddPatientPanel practiceId={practiceId} closeHref={listHref} /> : null}
    </div>
  );
}
