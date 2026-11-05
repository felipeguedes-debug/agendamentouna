"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { changeStatusAction, manualContactAction, resumeCadenceAction, type ActionResult } from "../../agendamentos/actions";

/** Row actions of the follow-up lists: confirm after the call, record the contact, resume the cadence. */
export function FollowUpActions({
  practiceId,
  appointmentId,
  actions,
}: {
  practiceId: string;
  appointmentId: string;
  actions: ("confirm" | "contact" | "resume")[];
}) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>) => startTransition(async () => setError((await action()).error));

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {actions.includes("confirm") ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(() => changeStatusAction(practiceId, { appointmentId, from: "SCHEDULED", to: "CONFIRMED" }))}
        >
          Confirmar
        </Button>
      ) : null}
      {actions.includes("contact") ? (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => manualContactAction(practiceId, appointmentId))}>
          Contato manual
        </Button>
      ) : null}
      {actions.includes("resume") ? (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => resumeCadenceAction(practiceId, appointmentId))}>
          Retomar régua
        </Button>
      ) : null}
      {error ? <span className="w-full text-right text-xs text-destructive">{error}</span> : null}
    </div>
  );
}
