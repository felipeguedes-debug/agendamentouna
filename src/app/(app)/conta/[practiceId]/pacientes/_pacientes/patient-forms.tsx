"use client";

import { useActionState, useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { useSubmitKeepingValues } from "@/components/use-submit-keeping-values";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONSENT_CHANNEL_LABELS } from "@/lib/domain/labels";
import { MANUAL_CONSENT_CHANNELS, type ConsentState } from "@/lib/domain/consent";
import { erasePatientAction, exportPatientAction, recordConsentAction, updatePatientPhoneAction, type ActionResult } from "../actions";
import { downloadText } from "./download";

/**
 * Records consent or its refusal or revocation (D-47), always as a new row. With
 * nothing recorded yet, both answers are offered.
 */
export function ConsentForm({ practiceId, patientId, state }: { practiceId: string; patientId: string; state: ConsentState }) {
  const [result, action, pending] = useActionState(recordConsentAction.bind(null, practiceId, patientId), {} as ActionResult);
  const submit = useSubmitKeepingValues(action);

  return (
    <form action={action} onSubmit={submit} className="flex flex-col gap-3" aria-label="Registrar consentimento">
      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="consent-channel">Como o paciente respondeu</Label>
        <NativeSelect id="consent-channel" name="channel" defaultValue="WHATSAPP" required>
          {MANUAL_CONSENT_CHANNELS.map((channel) => (
            <option key={channel} value={channel}>
              {CONSENT_CHANNEL_LABELS[channel]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-wrap gap-2">
        {state !== "granted" ? (
          <Button type="submit" name="granted" value="true" disabled={pending}>
            Registrar aceite
          </Button>
        ) : null}
        {state === "granted" ? (
          <Button type="submit" name="granted" value="false" variant="outline" disabled={pending}>
            Revogar consentimento
          </Button>
        ) : null}
        {state === "unknown" ? (
          <Button type="submit" name="granted" value="false" variant="outline" disabled={pending}>
            Registrar recusa
          </Button>
        ) : null}
      </div>
    </form>
  );
}

/** The data subject's export (D-49), saved by the browser as JSON. */
export function ExportPatientButton({ practiceId, patientId }: { practiceId: string; patientId: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const result = await exportPatientAction(practiceId, patientId);
      setError(result.error);
      if (result.data && result.filename) downloadText(result.filename, JSON.stringify(result.data, null, 2), "application/json");
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="button" variant="outline" onClick={run} disabled={pending} className="self-start">
        {pending ? "Gerando…" : "Exportar dados (JSON)"}
      </Button>
    </div>
  );
}

/** The patient's phone; the contact in SynkronosCRM follows (PRD 6, D-68). */
export function PatientPhoneForm({ practiceId, patientId, phone }: { practiceId: string; patientId: string; phone: string }) {
  const [result, action, pending] = useActionState(updatePatientPhoneAction.bind(null, practiceId, patientId), {} as ActionResult);
  const submit = useSubmitKeepingValues(action);

  return (
    <form action={action} onSubmit={submit} className="flex flex-col gap-3" aria-label="Alterar celular">
      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="patient-phone">Celular, com DDD</Label>
        <Input id="patient-phone" name="phone" defaultValue={phone} inputMode="tel" autoComplete="off" required />
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? "Salvando…" : "Salvar celular"}
      </Button>
    </form>
  );
}

/** Erasure at the data subject's request (D-28): typing EXCLUIR confirms it. */
export function ErasePatientForm({ practiceId, patientId }: { practiceId: string; patientId: string }) {
  const [result, action, pending] = useActionState(erasePatientAction.bind(null, practiceId, patientId), {} as ActionResult);
  const submit = useSubmitKeepingValues(action);

  return (
    <form action={action} onSubmit={submit} className="flex flex-col gap-3" aria-label="Excluir dados do paciente">
      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="erase-confirmation">Digite EXCLUIR para confirmar</Label>
        <Input id="erase-confirmation" name="confirmation" autoComplete="off" required className="max-w-48" />
      </div>
      <Button type="submit" variant="destructive" disabled={pending} className="self-start">
        {pending ? "Excluindo…" : "Excluir dados do paciente"}
      </Button>
    </form>
  );
}
