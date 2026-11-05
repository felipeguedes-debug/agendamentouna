"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SendWindowInput } from "@/lib/cadence/editor";
import { cn } from "@/lib/utils";
import { saveSendWindowAction, type CadenceActionResult } from "../actions";

/** Monday first, as the mockup; values are 0 = Sunday. */
const DAYS = [
  { value: 1, short: "S", name: "segunda" },
  { value: 2, short: "T", name: "terça" },
  { value: 3, short: "Q", name: "quarta" },
  { value: 4, short: "Q", name: "quinta" },
  { value: 5, short: "S", name: "sexta" },
  { value: 6, short: "S", name: "sábado" },
  { value: 0, short: "D", name: "domingo" },
];

/** The practice's send window and margin (D-07), shared by every cadence. */
export function SendWindowForm({ practiceId, initial }: { practiceId: string; initial: SendWindowInput }) {
  const [value, setValue] = useState(initial);
  const [result, setResult] = useState<CadenceActionResult>({});
  const [pending, startTransition] = useTransition();

  return (
    <form
      aria-label="Janela de envio"
      className="flex flex-col gap-3 rounded-xl bg-[#F4F6F5] px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setResult(await saveSendWindowAction(practiceId, value)));
      }}
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <span className="text-xs font-semibold">Janela de envio</span>
          <div className="flex items-center gap-1.5 text-sm">
            <Input aria-label="Início da janela" type="time" className="w-28 bg-white" value={value.start} onChange={(event) => setValue({ ...value, start: event.target.value })} />
            às
            <Input aria-label="Fim da janela" type="time" className="w-28 bg-white" value={value.end} onChange={(event) => setValue({ ...value, end: event.target.value })} />
          </div>
        </div>
        <fieldset className="space-y-1">
          <legend className="text-xs font-semibold">Dias</legend>
          <div className="flex gap-1">
            {DAYS.map((day) => {
              const checked = value.days.includes(day.value);
              return (
                <label
                  key={day.value}
                  title={day.name}
                  className={cn(
                    "inline-flex size-8 cursor-pointer items-center justify-center rounded-md text-xs font-medium",
                    checked ? "bg-primary text-primary-foreground" : "border border-input bg-white text-muted-foreground",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    aria-label={day.name}
                    checked={checked}
                    onChange={() => setValue({ ...value, days: checked ? value.days.filter((item) => item !== day.value) : [...value.days, day.value] })}
                  />
                  {day.short}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="space-y-1">
          <Label htmlFor="margin-hours" className="text-xs font-semibold">
            Margem antes do atendimento (h)
          </Label>
          <Input
            id="margin-hours"
            type="number"
            min={0}
            max={12}
            step={0.5}
            className="w-24 bg-white"
            value={value.marginHours}
            onChange={(event) => setValue({ ...value, marginHours: Number(event.target.value) })}
          />
        </div>
        <Button type="submit" variant="outline" className="ml-auto bg-white" disabled={pending}>
          {pending ? "Salvando…" : "Salvar janela"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Vale para todas as réguas da conta, no fuso de cada unidade. Passo fora da janela é antecipado para o último horário válido; se já passou, é adiado
        desde que fique a margem antes do atendimento; senão é pulado e o pulo fica no log.
      </p>
      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}
      {result.saved && !pending ? <span className="text-sm font-medium text-primary">Janela salva.</span> : null}
    </form>
  );
}
