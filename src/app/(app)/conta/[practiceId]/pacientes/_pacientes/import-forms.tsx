"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toCsv } from "@/lib/imports/csv";
import { MAX_FILE_BYTES } from "@/lib/imports/errors";
import type { ImportReport } from "@/lib/imports/sheet";
import { enableCadenceAction, importAction, type ImportState } from "../actions";
import { downloadText } from "./download";

const SHOWN_ERRORS = 100;

/** The rows with errors as a CSV in the sheet's own columns, plus "linha" and "erro", to fix and send again. */
function errorReportCsv(report: ImportReport) {
  const header = [...report.header, "linha", "erro"];
  const rows = report.errors.map((error) => [
    ...report.header.map((_, index) => error.values[index] ?? ""),
    String(error.line),
    error.messages.join(" "),
  ]);
  return `﻿${toCsv([header, ...rows], report.delimiter)}\r\n`;
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

function ReportView({ kind, fileName, report }: { kind: "patients" | "agenda"; fileName: string; report: ImportReport }) {
  const createdText = kind === "agenda" ? plural(report.created, "agendamento importado", "agendamentos importados") : plural(report.created, "paciente novo", "pacientes novos");
  const existingText = kind === "agenda" ? plural(report.existing, "já estava na agenda", "já estavam na agenda") : plural(report.existing, "já cadastrado", "já cadastrados");

  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Relatório da importação">
      <p className="text-sm">
        <span className="font-semibold">{fileName}</span>: {plural(report.totalRows, "linha", "linhas")} · <span data-testid="import-created">{createdText}</span> ·{" "}
        <span data-testid="import-existing">{existingText}</span> ·{" "}
        <span data-testid="import-errors" className={report.errors.length > 0 ? "font-semibold text-destructive" : undefined}>
          {plural(report.errors.length, "linha com erro", "linhas com erro")}
        </span>
      </p>
      {kind === "agenda" ? (
        <p className="text-xs text-muted-foreground">
          Pacientes: {plural(report.patientsCreated ?? 0, "novo", "novos")}, {plural(report.patientsExisting ?? 0, "já cadastrado", "já cadastrados")}. A régua dos agendamentos
          importados fica desligada até o gestor ligar, logo abaixo.
        </p>
      ) : null}
      {report.errors.length > 0 ? (
        <>
          <div className="max-h-80 overflow-y-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow className="text-xs tracking-wide text-muted-foreground uppercase">
                  <TableHead className="w-20 px-3">Linha</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.errors.slice(0, SHOWN_ERRORS).map((error) => (
                  <TableRow key={error.line} data-testid="import-error">
                    <TableCell className="px-3 tabular-nums">{error.line}</TableCell>
                    <TableCell className="whitespace-normal">{error.messages.join(" ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {report.errors.length > SHOWN_ERRORS ? (
            <p className="text-xs text-muted-foreground">Mostrando {SHOWN_ERRORS} de {report.errors.length}. O relatório traz todas.</p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            onClick={() => downloadText(`erros-${fileName.replace(/\.csv$/i, "")}.csv`, errorReportCsv(report), "text/csv;charset=utf-8")}
          >
            Baixar relatório de erros (CSV)
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** Upload of one spreadsheet; the report comes back in the response and is not stored (D-48). */
export function ImportForm({ practiceId, kind }: { practiceId: string; kind: "patients" | "agenda" }) {
  const [state, action, pending] = useActionState(importAction.bind(null, practiceId), {} as ImportState);
  const [tooLarge, setTooLarge] = useState(false);
  const inputId = `import-${kind}`;

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-wrap items-end gap-3" aria-label={kind === "agenda" ? "Importar agenda" : "Importar pacientes"}>
        <input type="hidden" name="kind" value={kind} />
        <div className="min-w-60 flex-1 space-y-1.5">
          <Label htmlFor={inputId}>Arquivo CSV</Label>
          <Input
            id={inputId}
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            onChange={(event) => setTooLarge((event.target.files?.[0]?.size ?? 0) > MAX_FILE_BYTES)}
          />
        </div>
        <Button type="submit" disabled={pending || tooLarge}>
          {pending ? "Importando…" : "Importar"}
        </Button>
      </form>
      {tooLarge ? (
        <Alert variant="destructive">
          <AlertDescription>O arquivo passa de 900 KB. Divida a planilha em partes menores.</AlertDescription>
        </Alert>
      ) : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.report && state.fileName ? <ReportView kind={kind} fileName={state.fileName} report={state.report} /> : null}
    </div>
  );
}

/** Turns on the cadence of imported appointments, for one professional or all (D-18). */
export function EnableCadenceButton({ practiceId, professionalId, label }: { practiceId: string; professionalId: string | null; label: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant={professionalId ? "outline" : "default"}
        disabled={pending}
        onClick={() => startTransition(async () => setError((await enableCadenceAction(practiceId, professionalId)).error))}
      >
        {pending ? "Ligando…" : label}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
