"use client";

import { Ellipsis } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { NativeSelect } from "@/components/native-select";
import { useSubmitKeepingValues } from "@/components/use-submit-keeping-values";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STATUS_LABELS } from "@/lib/domain/labels";
import { changeStatusAction, rescheduleAction, type ActionResult } from "../actions";

const FLOW_LABELS: Partial<Record<AppointmentStatus, string>> = {
  CONFIRMED: "Confirmar",
  ARRIVED: "Marcar chegada",
  IN_PROGRESS: "Iniciar atendimento",
  COMPLETED: "Atendido",
  NO_SHOW: "Faltou",
};
const CANCELLATIONS: AppointmentStatus[] = ["CANCELED_BY_PATIENT", "CANCELED_BY_PRACTICE"];

/**
 * Status actions of one appointment, from the section 4 table: the next step in sight,
 * Remarcar when asked for, the other steps and the cancellations (with an optional
 * reason) in the menu (D-83), and the manager's correction of a final status, which
 * needs a reason (D-11).
 */
export function StatusActions({
  practiceId,
  appointmentId,
  status,
  next,
  correction,
  reschedule,
}: {
  practiceId: string;
  appointmentId: string;
  status: AppointmentStatus;
  next: AppointmentStatus[];
  /** True when the next statuses are corrections between final statuses. */
  correction: boolean;
  /** What the rescheduling form needs, when the user may reschedule. */
  reschedule: Pick<Parameters<typeof RescheduleForm>[0], "defaults" | "professionals" | "canOverbook"> | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [cancelReason, setCancelReason] = useState("");
  const [correctTo, setCorrectTo] = useState<AppointmentStatus | "">("");
  const [correctReason, setCorrectReason] = useState("");
  const [canceling, setCanceling] = useState<AppointmentStatus | null>(null);
  const [rescheduling, setRescheduling] = useState(false);

  const run = (to: AppointmentStatus, reason?: string) =>
    startTransition(async () => {
      setError((await changeStatusAction(practiceId, { appointmentId, from: status, to, reason })).error);
    });

  if (correction) {
    if (next.length === 0) return null;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Status final. Só gestor ou admin corrige, com motivo.</p>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="correct-to">Corrigir para</Label>
            <NativeSelect id="correct-to" value={correctTo} onChange={(event) => setCorrectTo(event.target.value as AppointmentStatus)}>
              <option value="">Escolha…</option>
              {next.map((to) => (
                <option key={to} value={to}>
                  {STATUS_LABELS[to]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="correct-reason">Motivo da correção</Label>
            <Input id="correct-reason" value={correctReason} onChange={(event) => setCorrectReason(event.target.value)} maxLength={500} />
          </div>
          <Button type="button" className="justify-self-end" disabled={pending || !correctTo} onClick={() => correctTo && run(correctTo, correctReason)}>
            Corrigir status
          </Button>
        </div>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  const [main, ...otherSteps] = next.filter((to) => FLOW_LABELS[to]);
  const cancellations = next.filter((to) => CANCELLATIONS.includes(to));
  if (!main && cancellations.length === 0 && !reschedule) return null;
  const cancelLabel = (to: AppointmentStatus) => (to === "CANCELED_BY_PATIENT" ? "Cancelar pelo paciente" : "Cancelar pelo consultório");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {main ? (
          <Button type="button" size="lg" disabled={pending} onClick={() => run(main)}>
            {FLOW_LABELS[main]}
          </Button>
        ) : null}
        {reschedule ? (
          <Button type="button" variant="outline" size="lg" aria-expanded={rescheduling} onClick={() => setRescheduling((open) => !open)}>
            Remarcar
          </Button>
        ) : null}
        {otherSteps.length > 0 || cancellations.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon-lg" aria-label="Mais ações" disabled={pending}>
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-52">
              {otherSteps.map((to) => (
                <DropdownMenuItem key={to} onSelect={() => run(to)}>
                  {FLOW_LABELS[to]}
                </DropdownMenuItem>
              ))}
              {cancellations.map((to) => (
                <DropdownMenuItem key={to} className="text-destructive focus:text-destructive" onSelect={() => setCanceling(to)}>
                  {cancelLabel(to)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      {canceling ? (
        <div className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Motivo do cancelamento (opcional)</Label>
            <Input id="cancel-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setCanceling(null)}>
              Voltar
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => run(canceling, cancelReason)}>
              Confirmar: {cancelLabel(canceling).toLowerCase()}
            </Button>
          </div>
        </div>
      ) : null}
      {rescheduling && reschedule ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Cria um agendamento novo com o mesmo tipo, duração e valor. Este fica como Reagendado, com o histórico.</p>
          <RescheduleForm practiceId={practiceId} appointmentId={appointmentId} {...reschedule} />
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

/** Reschedule (D-11): a new appointment at another time; this one becomes Reagendado. */
export function RescheduleForm({
  practiceId,
  appointmentId,
  defaults,
  professionals,
  canOverbook,
}: {
  practiceId: string;
  appointmentId: string;
  defaults: { date: string; time: string; professionalId: string; locationId: string };
  professionals: { id: string; name: string; locations: { id: string; name: string }[] }[];
  canOverbook: boolean;
}) {
  const [state, action, pending] = useActionState(rescheduleAction.bind(null, practiceId, appointmentId), {} as ActionResult);
  const submit = useSubmitKeepingValues(action);
  const [professionalId, setProfessionalId] = useState(defaults.professionalId);
  const locations = professionals.find((professional) => professional.id === professionalId)?.locations ?? [];

  return (
    <form action={action} onSubmit={submit} aria-label="Remarcar" className="grid gap-3 sm:grid-cols-2">
      {state.error ? (
        <Alert variant="destructive" className="sm:col-span-2">
          <AlertDescription>
            {state.error}
            {state.details?.length ? <span className="block">{state.details.join("; ")}</span> : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="reschedule-date">Nova data</Label>
        <Input id="reschedule-date" name="date" type="date" defaultValue={defaults.date} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reschedule-time">Nova hora</Label>
        <Input id="reschedule-time" name="time" type="time" step={300} defaultValue={defaults.time} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reschedule-professional">Profissional</Label>
        <NativeSelect id="reschedule-professional" name="professionalId" value={professionalId} onChange={(event) => setProfessionalId(event.target.value)}>
          {professionals.map((professional) => (
            <option key={professional.id} value={professional.id}>
              {professional.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reschedule-location">Unidade</Label>
        <NativeSelect
          key={professionalId}
          id="reschedule-location"
          name="locationId"
          defaultValue={locations.some((location) => location.id === defaults.locationId) ? defaults.locationId : locations[0]?.id}
        >
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2">
        {canOverbook && state.details?.length ? (
          <label className="mr-auto inline-flex items-center gap-2 text-sm text-[#3A4542]">
            <input type="checkbox" name="allowConflict" className="size-4 accent-primary" />
            Encaixe: marcar mesmo com conflito
          </label>
        ) : null}
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Remarcando…" : "Remarcar"}
        </Button>
      </div>
    </form>
  );
}
