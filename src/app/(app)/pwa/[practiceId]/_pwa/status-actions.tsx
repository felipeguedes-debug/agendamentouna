"use client";

import { useState, useTransition } from "react";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { changeStatusAction } from "../../../conta/[practiceId]/agendamentos/actions";

/** What the professional does on the phone, from the status table (D-10, D-44). */
const LABELS: Partial<Record<AppointmentStatus, string>> = {
  ARRIVED: "Marcar chegada",
  IN_PROGRESS: "Iniciar atendimento",
  COMPLETED: "Atendido",
};

export function StatusActions({
  practiceId,
  appointmentId,
  status,
  next,
  primary,
}: {
  practiceId: string;
  appointmentId: string;
  status: AppointmentStatus;
  next: AppointmentStatus[];
  primary?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const actions = next.filter((to) => LABELS[to]);
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-2">
        {actions.map((to, index) => (
          <Button
            key={to}
            type="button"
            size="lg"
            variant={primary && index === 0 ? "default" : "outline"}
            disabled={pending}
            className="h-11 flex-1"
            onClick={() =>
              startTransition(async () => {
                try {
                  setError((await changeStatusAction(practiceId, { appointmentId, from: status, to })).error);
                } catch {
                  setError("Não foi possível falar com o servidor. Confira a agenda e tente de novo.");
                }
              })
            }
          >
            {LABELS[to]}
          </Button>
        ))}
      </div>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
