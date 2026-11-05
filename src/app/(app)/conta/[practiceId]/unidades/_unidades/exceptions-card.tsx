"use client";

import { X } from "lucide-react";
import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addExceptionAction, removeExceptionAction } from "../actions";

/** Whole days off: holidays, vacations (D-86). For a few hours, a block on the agenda. */
export function ExceptionsCard({
  practiceId,
  professionalId,
  locations,
  exceptions,
}: {
  practiceId: string;
  professionalId: string;
  locations: { id: string; name: string }[];
  exceptions: { id: string; period: string; reason: string; locationName: string | null }[];
}) {
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [reason, setReason] = useState("");
  const [locationId, setLocationId] = useState("");
  const [allProfessionals, setAllProfessionals] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      const result = await addExceptionAction(practiceId, { professionalId, allProfessionals, locationId: locationId || null, startsOn, endsOn: endsOn || startsOn, reason });
      setError(result.error);
      if (!result.error) {
        setStartsOn("");
        setEndsOn("");
        setReason("");
        setAllProfessionals(false);
      }
    });
  const remove = (id: string) =>
    startTransition(async () => {
      setError((await removeExceptionAction(practiceId, id)).error);
    });

  return (
    <section aria-labelledby="exceptions" className="min-w-0 flex-[2_1_320px] overflow-hidden rounded-xl border border-border bg-white">
      <div className="flex flex-col gap-0.5 border-b border-[#EEF1F0] px-4 py-3.5">
        <h2 id="exceptions" className="text-[15px] font-semibold">
          Exceções
        </h2>
        <p className="text-[13px] text-muted-foreground">Dias inteiros sem atendimento. Para poucas horas, use Bloquear na agenda.</p>
      </div>
      {exceptions.length > 0 ? (
        <ul>
          {exceptions.map((exception) => (
            <li key={exception.id} data-testid="exception-row" className="flex items-center gap-2.5 border-b border-[#EEF1F0] px-4 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[13px] font-semibold">{exception.period}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  {exception.reason} · {exception.locationName ?? "Todas as unidades"}
                </span>
              </span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remover exceção de ${exception.period}`} disabled={pending} onClick={() => remove(exception.id)}>
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-col gap-2.5 bg-[#F8FAF9] px-4 py-3.5"
        aria-label="Nova exceção"
        onSubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <h3 className="text-[13px] font-semibold">Nova exceção</h3>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="exception-start">De</Label>
            <Input id="exception-start" type="date" className="bg-white" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="exception-end">Até</Label>
            <Input id="exception-end" type="date" className="bg-white" value={endsOn} min={startsOn || undefined} onChange={(event) => setEndsOn(event.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="exception-reason">Motivo</Label>
          <Input id="exception-reason" className="bg-white" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={120} placeholder="Feriado, férias, congresso" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="exception-location">Unidade</Label>
          <NativeSelect id="exception-location" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">Todas as unidades</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-[#3A4542]">
          <input type="checkbox" className="size-4 accent-primary" checked={allProfessionals} onChange={(event) => setAllProfessionals(event.target.checked)} />
          Aplicar a todos os profissionais
        </label>
        <div>
          <Button type="submit" variant="outline" disabled={pending}>
            Adicionar exceção
          </Button>
        </div>
      </form>
    </section>
  );
}
