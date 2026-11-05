"use client";

import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { manualContactAction, manualDispatchAction, resumeCadenceAction, type ActionResult } from "../actions";

/**
 * Cadence actions of one appointment (PRD 6, rule 3; D-05, D-06): send a step's
 * text now, record a manual contact, resume a cadence paused by a free-text reply.
 */
export function CadenceActions({
  practiceId,
  appointmentId,
  manualSteps,
  canRecordContact,
  canResume,
}: {
  practiceId: string;
  appointmentId: string;
  manualSteps: { id: string; label: string }[];
  canRecordContact: boolean;
  canResume: boolean;
}) {
  const [stepId, setStepId] = useState(manualSteps[0]?.id ?? "");
  const [result, setResult] = useState<ActionResult & { done?: string }>({});
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>, done: string) =>
    startTransition(async () => {
      const outcome = await action();
      setResult(outcome.error ? outcome : { done });
    });

  if (manualSteps.length === 0 && !canRecordContact && !canResume) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {manualSteps.length > 0 ? (
          <>
            <NativeSelect aria-label="Passo para enviar agora" className="w-auto max-w-full" value={stepId} onChange={(event) => setStepId(event.target.value)}>
              {manualSteps.map((step) => (
                <option key={step.id} value={step.id}>
                  {step.label}
                </option>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !stepId}
              onClick={() => run(() => manualDispatchAction(practiceId, { appointmentId, stepId }), "Mensagem na fila de envio.")}
            >
              Enviar agora
            </Button>
          </>
        ) : null}
        {canRecordContact ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => manualContactAction(practiceId, appointmentId), "Contato manual registrado.")}>
            Registrar contato manual
          </Button>
        ) : null}
        {canResume ? (
          <Button type="button" disabled={pending} onClick={() => run(() => resumeCadenceAction(practiceId, appointmentId), "Régua retomada.")}>
            Retomar régua
          </Button>
        ) : null}
      </div>
      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}
      {result.done && !pending ? <p className="text-sm font-medium text-primary">{result.done}</p> : null}
    </div>
  );
}
