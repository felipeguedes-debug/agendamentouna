"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeWorkingHoursAction, saveWorkingHoursAction } from "../actions";

type Row = { id: string; weekday: number; startTime: string; endTime: string; locationId: string; locationName: string };
type Option = { id: string; name: string };

/** Monday first, as people read the week; the code keeps Sunday as 0. */
const WEEK = [
  { weekday: 1, label: "Segunda" },
  { weekday: 2, label: "Terça" },
  { weekday: 3, label: "Quarta" },
  { weekday: 4, label: "Quinta" },
  { weekday: 5, label: "Sexta" },
  { weekday: 6, label: "Sábado" },
  { weekday: 0, label: "Domingo" },
];

export function ProfessionalPicker({ base, selectedId, professionals }: { base: string; selectedId: string; professionals: Option[] }) {
  const router = useRouter();
  return (
    <NativeSelect aria-label="Profissional" className="w-60 font-medium" value={selectedId} onChange={(event) => router.push(`${base}?profissional=${event.target.value}`)}>
      {professionals.map((professional) => (
        <option key={professional.id} value={professional.id}>
          {professional.name}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Editing one interval, in the row of its day. */
function IntervalForm({
  practiceId,
  professionalId,
  weekday,
  label,
  locations,
  row,
  onDone,
}: {
  practiceId: string;
  professionalId: string;
  weekday: number;
  label: string;
  locations: Option[];
  row: Row | null;
  onDone: () => void;
}) {
  const [startTime, setStartTime] = useState(row?.startTime ?? "08:00");
  const [endTime, setEndTime] = useState(row?.endTime ?? "12:00");
  const [locationId, setLocationId] = useState(row?.locationId ?? locations[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const run = (action: () => ReturnType<typeof removeWorkingHoursAction>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.error);
      if (!result.error) onDone();
    });
  const id = `${weekday}-${row?.id ?? "new"}`;

  return (
    <div role="group" aria-label={`Intervalo de ${label}`} className="flex w-full flex-wrap items-end gap-2 rounded-[10px] bg-accent p-2.5">
      <div className="w-[92px] space-y-1">
        <Label htmlFor={`start-${id}`}>Início</Label>
        <Input id={`start-${id}`} type="time" step={300} className="bg-white" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
      </div>
      <div className="w-[92px] space-y-1">
        <Label htmlFor={`end-${id}`}>Fim</Label>
        <Input id={`end-${id}`} type="time" step={300} className="bg-white" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
      </div>
      <div className="min-w-36 flex-1 space-y-1">
        <Label htmlFor={`location-${id}`}>Unidade</Label>
        <NativeSelect id={`location-${id}`} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Button type="button" disabled={pending} className="h-9" onClick={() => run(() => saveWorkingHoursAction(practiceId, row?.id ?? null, { professionalId, locationId, weekday, startTime, endTime }))}>
        Salvar
      </Button>
      <Button type="button" variant="outline" className="h-9" onClick={onDone}>
        Cancelar
      </Button>
      {row ? (
        <Button type="button" variant="destructive" disabled={pending} className="h-9" onClick={() => run(() => removeWorkingHoursAction(practiceId, row.id))}>
          <X aria-hidden />
          Remover
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The week of one professional: a click opens the interval in place (D-86). */
export function HoursEditor({ practiceId, professionalId, hours, locations }: { practiceId: string; professionalId: string; hours: Row[]; locations: Option[] }) {
  // "new-1": a new interval on Monday; otherwise the id of the interval being edited.
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <section aria-labelledby="working-hours" className="min-w-0 flex-[3_1_560px] overflow-hidden rounded-xl border border-border bg-white">
      <div className="flex flex-col gap-0.5 border-b border-[#EEF1F0] px-4 py-3.5">
        <h2 id="working-hours" className="text-[15px] font-semibold">
          Horário de atendimento
        </h2>
        <p className="text-[13px] text-muted-foreground">Orienta a agenda, mas não impede um agendamento fora dele. O almoço é o espaço entre dois intervalos.</p>
      </div>
      <ul className="divide-y divide-[#EEF1F0]">
        {WEEK.map(({ weekday, label }) => {
          const rows = hours.filter((row) => row.weekday === weekday);
          const editingRow = rows.find((row) => row.id === editing) ?? null;
          const adding = editing === `new-${weekday}`;
          return (
            <li key={weekday} data-testid="weekday-row" className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <span className="w-[68px] text-[13.5px] font-semibold">{label}</span>
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  aria-label={`Editar ${label}, ${row.startTime} às ${row.endTime}`}
                  aria-expanded={row.id === editing}
                  onClick={() => setEditing(row.id === editing ? null : row.id)}
                  className="flex flex-col items-start gap-px rounded-lg border border-border bg-[#F8FAF9] px-2.5 py-1.5 text-left hover:border-primary"
                >
                  <span className="text-[13px] font-semibold tabular-nums">
                    {row.startTime} às {row.endTime}
                  </span>
                  <span className="text-xs text-muted-foreground">{row.locationName}</span>
                </button>
              ))}
              {rows.length === 0 && !adding ? <span className="text-[13px] text-muted-foreground">Não atende</span> : null}
              {!adding ? (
                <Button type="button" variant="ghost" size="sm" className="ml-auto text-primary" aria-label={`Adicionar intervalo em ${label}`} onClick={() => setEditing(`new-${weekday}`)}>
                  <Plus aria-hidden />
                  Intervalo
                </Button>
              ) : null}
              {adding ? <IntervalForm practiceId={practiceId} professionalId={professionalId} weekday={weekday} label={label} locations={locations} row={null} onDone={() => setEditing(null)} /> : null}
              {editingRow ? <IntervalForm key={editingRow.id} practiceId={practiceId} professionalId={professionalId} weekday={weekday} label={label} locations={locations} row={editingRow} onDone={() => setEditing(null)} /> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
