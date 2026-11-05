import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requirePracticePermission } from "@/lib/auth/guard";
import { can } from "@/lib/auth/permissions";
import { importedWithoutCadence } from "@/lib/imports/agenda-import";
import { MAX_AGENDA_ROWS, MAX_PATIENT_ROWS } from "@/lib/imports/errors";
import { AGENDA_COLUMNS, PATIENT_COLUMNS, type ColumnSpec } from "@/lib/imports/templates";
import { EnableCadenceButton, ImportForm } from "../_pacientes/import-forms";

export const metadata: Metadata = { title: "Importar planilha" };

const rows = new Intl.NumberFormat("pt-BR");

function Columns({ columns }: { columns: readonly ColumnSpec[] }) {
  return (
    <p className="text-xs text-muted-foreground">
      Colunas:{" "}
      {columns.map((column, index) => (
        <span key={column.key}>
          {index > 0 ? ", " : ""}
          {column.required ? <strong className="text-foreground">{column.key}</strong> : column.key}
        </span>
      ))}
      . Em negrito, as obrigatórias. Separador ponto e vírgula ou vírgula; arquivo em UTF-8 ou no CSV comum do Excel.
    </p>
  );
}

function Card({ title, label, children }: { title: string; label: string; children: ReactNode }) {
  return (
    <section aria-labelledby={label} className="flex flex-col gap-3 rounded-xl border border-border bg-white px-5 py-4">
      <h2 id={label} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Spreadsheet import with the CSV templates (PRD 4 rule 9; D-18, D-48), for the manager. */
export default async function ImportPage({ params }: PageProps<"/conta/[practiceId]/pacientes/importar">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "patients:import");
  const pending = can(context.access.role, "cadence:edit") ? await importedWithoutCadence(context) : null;
  const total = pending?.reduce((sum, row) => sum + row.count, 0) ?? 0;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <Link href={`/conta/${practiceId}/pacientes`} className="text-sm font-medium text-primary hover:underline">
        ← Pacientes
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Importar planilha</h1>
        <p className="text-sm text-muted-foreground">
          Traga pacientes e agenda de outro sistema ou da planilha da secretária. Linhas com erro não entram e voltam num relatório; o resto é importado.
        </p>
      </div>

      <Card title="Pacientes" label="importar-pacientes">
        <p className="text-sm text-[#3A4542]">
          Paciente com celular já cadastrado na conta não é duplicado nem alterado. O consentimento de WhatsApp (sim ou não) vale só para paciente novo e fica registrado com
          o canal Importação. Até {rows.format(MAX_PATIENT_ROWS)} linhas por arquivo.
        </p>
        <Columns columns={PATIENT_COLUMNS} />
        <a href="/modelos/pacientes.csv" download className="self-start text-sm font-semibold text-primary hover:underline">
          Baixar modelo de pacientes (CSV)
        </a>
        <ImportForm practiceId={practiceId} kind="patients" />
      </Card>

      <Card title="Agenda" label="importar-agenda">
        <p className="text-sm text-[#3A4542]">
          Profissional, unidade e tipo precisam existir na conta, com o mesmo nome. Paciente é encontrado pelo celular ou cadastrado. Conflito de horário não entra; agendamento
          que já está na agenda é reconhecido, então reenviar a mesma planilha não duplica. Status aceitos: Agendado (padrão), Confirmado, Atendido, Faltou, Cancelado pelo
          paciente e Cancelado pelo consultório. Até {rows.format(MAX_AGENDA_ROWS)} linhas por arquivo.
        </p>
        <Columns columns={AGENDA_COLUMNS} />
        <a href="/modelos/agenda.csv" download className="self-start text-sm font-semibold text-primary hover:underline">
          Baixar modelo de agenda (CSV)
        </a>
        <ImportForm practiceId={practiceId} kind="agenda" />
      </Card>

      {pending ? (
        <Card title="Régua dos agendamentos importados" label="regua-importados">
          <p className="text-sm text-[#3A4542]">
            Agendamentos importados entram com a régua de WhatsApp desligada. Revise a agenda e ligue em lote; só os futuros em Agendado ou Confirmado entram.
          </p>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="cadence-pending">
              Nenhum agendamento importado esperando a régua.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
                    <TableHead className="px-3">Profissional</TableHead>
                    <TableHead>Agendamentos</TableHead>
                    <TableHead className="sr-only">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pending.map((row) => (
                    <TableRow key={row.professionalId} data-testid="cadence-pending-row">
                      <TableCell className="px-3">{row.professionalName}</TableCell>
                      <TableCell className="tabular-nums">{rows.format(row.count)}</TableCell>
                      <TableCell className="text-right">
                        <EnableCadenceButton practiceId={practiceId} professionalId={row.professionalId} label="Ligar régua" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pending.length > 1 ? (
                <div className="flex justify-end">
                  <EnableCadenceButton practiceId={practiceId} professionalId={null} label={`Ligar régua de todos (${rows.format(total)})`} />
                </div>
              ) : null}
            </>
          )}
        </Card>
      ) : null}
    </div>
  );
}
