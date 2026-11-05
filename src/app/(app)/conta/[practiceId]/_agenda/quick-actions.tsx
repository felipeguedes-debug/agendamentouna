"use client";

import { Ellipsis } from "lucide-react";
import { useState, useTransition } from "react";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { changeStatusAction } from "../agendamentos/actions";

/** Labels of the one-click status buttons of the day list (PRD 4: confirmar, marcar chegada, dar baixa). */
export const QUICK_ACTION_LABELS: Partial<Record<AppointmentStatus, string>> = {
  CONFIRMED: "Confirmar",
  ARRIVED: "Chegou",
  IN_PROGRESS: "Em atendimento",
  COMPLETED: "Atendido",
  NO_SHOW: "Faltou",
};

/** The next step on the row, the other ones in its menu (D-82). */
export function QuickActions({
  practiceId,
  appointmentId,
  status,
  next,
}: {
  practiceId: string;
  appointmentId: string;
  status: AppointmentStatus;
  /** Statuses the user may set, from the section 4 table. */
  next: AppointmentStatus[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const actions = next.filter((to) => QUICK_ACTION_LABELS[to]);
  if (actions.length === 0) return null;
  const [main, ...others] = actions;
  const run = (to: AppointmentStatus) =>
    startTransition(async () => {
      setError((await changeStatusAction(practiceId, { appointmentId, from: status, to })).error);
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button type="button" size="sm" variant="secondary" className="bg-accent text-accent-foreground hover:bg-accent/70" disabled={pending} onClick={() => run(main)}>
        {QUICK_ACTION_LABELS[main]}
      </Button>
      {others.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon-sm" variant="outline" aria-label="Mais ações" disabled={pending}>
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            {others.map((to) => (
              <DropdownMenuItem key={to} onSelect={() => run(to)}>
                {QUICK_ACTION_LABELS[to]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {error ? (
        <p role="alert" className="w-full text-right text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
