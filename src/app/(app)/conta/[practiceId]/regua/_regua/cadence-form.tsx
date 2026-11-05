"use client";

import { useState, useTransition } from "react";
import type { AppointmentCategory } from "@/generated/prisma/enums";
import { NativeSelect } from "@/components/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CadenceInput, StepInput } from "@/lib/cadence/editor";
import { TEMPLATE_VARIABLES } from "@/lib/cadence/template";
import { MAX_CADENCE_STEPS } from "@/lib/domain/cadence";
import { CADENCE_ACTION_LABELS, CATEGORY_LABELS } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { saveCadenceAction, type CadenceActionResult } from "../actions";

type TypeOption = { id: string; name: string; category: AppointmentCategory; color: string; active: boolean; otherCadence: string | null };

const NEW_STEP: StepInput = {
  when: "days",
  amount: 1,
  time: "18:00",
  statuses: "scheduled",
  action: "REQUEST_CONFIRMATION",
  template: "{primeiro_nome}, amanhã às {hora} é seu {tipo} com {profissional}. Pode confirmar? Responda 1 para confirmar, 2 para remarcar ou 3 para cancelar.",
};

/**
 * The cadence editor of the mockup (ReguaWhatsApp): name, types and professionals it
 * applies to, active switch and up to 4 steps. Controlled state, sent as one object
 * to the Server Action; the server validates everything again.
 */
export function CadenceForm({
  practiceId,
  cadenceId,
  initial,
  version,
  types,
  professionals,
}: {
  practiceId: string;
  cadenceId: string;
  initial: CadenceInput;
  version: number;
  types: TypeOption[];
  professionals: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(initial);
  const [result, setResult] = useState<CadenceActionResult>({});
  const [pending, startTransition] = useTransition();
  const update = (patch: Partial<CadenceInput>) => setValue((current) => ({ ...current, ...patch }));
  const updateStep = (index: number, patch: Partial<StepInput>) =>
    setValue((current) => ({
      ...current,
      steps: current.steps.map((step, position) => {
        if (position !== index) return step;
        const next = { ...step, ...patch };
        // A confirmation request only makes sense while Agendado (D-06).
        return next.action === "REQUEST_CONFIRMATION" ? { ...next, statuses: "scheduled" } : next;
      }),
    }));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  const save = () =>
    startTransition(async () => {
      setResult(await saveCadenceAction(practiceId, cadenceId, value));
    });

  return (
    <form
      aria-label="Editar régua"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="grid gap-4 rounded-xl border border-border bg-white p-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cadence-name">Nome da régua</Label>
          <Input id="cadence-name" value={value.name} onChange={(event) => update({ name: event.target.value })} maxLength={80} required />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={value.active} onChange={(event) => update({ active: event.target.checked })} />
          Régua ativa
        </label>

        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium">Aplica a</legend>
          <p className="text-xs text-muted-foreground">Cada tipo tem uma régua: marcar um tipo aqui o tira da régua anterior.</p>
          <div className="flex flex-wrap gap-2">
            {types.map((type) => {
              const checked = value.typeIds.includes(type.id);
              return (
                <label
                  key={type.id}
                  className={cn(
                    "inline-flex h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-xs font-medium",
                    checked ? "border-primary bg-accent text-primary" : "border-dashed border-input text-muted-foreground",
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={checked} onChange={() => update({ typeIds: toggle(value.typeIds, type.id) })} />
                  <span className="size-2 rounded-full" style={{ background: type.color }} />
                  {type.name}
                  <span className="font-normal">· {CATEGORY_LABELS[type.category]}</span>
                  {!type.active ? <span className="font-normal">(inativo)</span> : null}
                  {type.otherCadence && !checked ? <span className="font-normal">(hoje em {type.otherCadence})</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="space-y-2 sm:col-span-2">
          <legend className="text-sm font-medium">Profissionais</legend>
          <p className="text-xs text-muted-foreground">Nenhum marcado: vale para todos os profissionais da conta.</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {professionals.map((professional) => (
              <label key={professional.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={value.professionalIds.includes(professional.id)}
                  onChange={() => update({ professionalIds: toggle(value.professionalIds, professional.id) })}
                />
                {professional.name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold">Passos</h2>
        <span className="text-xs text-muted-foreground">Variáveis: {TEMPLATE_VARIABLES.map((name) => `{${name}}`).join(" ")}</span>
      </div>

      <ol className="flex flex-col gap-3">
        {value.steps.map((step, index) => (
          <li key={index} className="flex gap-3 rounded-xl border border-border bg-white px-4 py-3.5" aria-label={`Passo ${index + 1}`}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{index + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <NativeSelect
                  aria-label="Quando"
                  className="w-auto"
                  value={step.when}
                  onChange={(event) => {
                    const when = event.target.value as StepInput["when"];
                    updateStep(index, { when, amount: when === "booking" ? 0 : when === "days" ? 1 : 3, time: when === "days" ? "18:00" : "" });
                  }}
                >
                  <option value="booking">Ao agendar</option>
                  <option value="days">Dias antes</option>
                  <option value="hours">Horas antes</option>
                </NativeSelect>
                {step.when !== "booking" ? (
                  <Input
                    aria-label={step.when === "days" ? "Quantos dias antes" : "Quantas horas antes"}
                    type="number"
                    min={1}
                    max={step.when === "days" ? 30 : 72}
                    className="w-20"
                    value={step.amount}
                    onChange={(event) => updateStep(index, { amount: Number(event.target.value) })}
                  />
                ) : null}
                {step.when === "days" ? (
                  <>
                    <span className="text-sm text-muted-foreground">{step.amount === 1 ? "dia antes, às" : "dias antes, às"}</span>
                    <Input aria-label="Horário" type="time" className="w-28" value={step.time} onChange={(event) => updateStep(index, { time: event.target.value })} />
                  </>
                ) : null}
                {step.when === "hours" ? <span className="text-sm text-muted-foreground">{step.amount === 1 ? "hora antes" : "horas antes"}</span> : null}
                <NativeSelect aria-label="Ação esperada" className="w-auto" value={step.action} onChange={(event) => updateStep(index, { action: event.target.value as StepInput["action"] })}>
                  {(["REQUEST_CONFIRMATION", "REMINDER"] as const).map((action) => (
                    <option key={action} value={action}>
                      {CADENCE_ACTION_LABELS[action]}
                    </option>
                  ))}
                </NativeSelect>
                <NativeSelect
                  aria-label="Status elegível"
                  className="w-auto"
                  value={step.statuses}
                  disabled={step.action === "REQUEST_CONFIRMATION"}
                  onChange={(event) => updateStep(index, { statuses: event.target.value as StepInput["statuses"] })}
                >
                  <option value="scheduled">Só Agendado</option>
                  <option value="scheduled_confirmed">Agendado e Confirmado</option>
                </NativeSelect>
                {value.steps.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-muted-foreground"
                    onClick={() => setValue((current) => ({ ...current, steps: current.steps.filter((_, position) => position !== index) }))}
                  >
                    Remover
                  </Button>
                ) : null}
              </div>
              <Textarea
                aria-label={`Texto do passo ${index + 1}`}
                rows={3}
                maxLength={1000}
                value={step.template}
                onChange={(event) => updateStep(index, { template: event.target.value })}
              />
            </div>
          </li>
        ))}
      </ol>
      {value.steps.length < MAX_CADENCE_STEPS ? (
        <Button type="button" variant="outline" className="border-dashed text-primary" onClick={() => update({ steps: [...value.steps, NEW_STEP] })}>
          + Adicionar passo (até {MAX_CADENCE_STEPS})
        </Button>
      ) : null}

      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {result.error}
            {result.details?.length ? (
              <ul className="mt-1 list-disc pl-5">
                {result.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          Versão {version}. Mudar os passos cria uma versão nova; o que já está agendado para as próximas 24 h sai como estava.
        </p>
        {result.saved && !pending ? <span className="text-sm font-medium text-primary">Régua salva.</span> : null}
        <Button type="submit" size="lg" className="ml-auto" disabled={pending}>
          {pending ? "Salvando…" : "Salvar régua"}
        </Button>
      </div>
    </form>
  );
}
