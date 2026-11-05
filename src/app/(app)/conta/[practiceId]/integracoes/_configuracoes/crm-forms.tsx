"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { disconnectCrmAction, registerCrmWebhookAction, retryCrmExportsAction, saveCrmTokenAction, type SettingsActionResult } from "../actions";

/** The FlwChat token (D-68): the field always starts empty, since the token never comes back from the server. */
export function CrmTokenForm({ practiceId, connected }: { practiceId: string; connected: boolean }) {
  const [result, action, pending] = useActionState(saveCrmTokenAction.bind(null, practiceId), {} as SettingsActionResult);

  return (
    <form action={action} className="flex flex-col gap-3" aria-label="Conectar a SynkronosCRM">
      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="crm-token">{connected ? "Trocar o token do FlwChat" : "Token do FlwChat"}</Label>
        <Input id="crm-token" name="token" type="password" autoComplete="off" spellCheck={false} required className="max-w-md" />
        <p className="text-xs text-muted-foreground">Na Synkronos, em Ajustes › Integrações › Integração via API. Depois de salvo, não é mostrado de novo.</p>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Conferindo o token…" : "Salvar token"}
      </Button>
    </form>
  );
}

/** Re-registering the webhook, retrying what gave up and disconnecting. */
export function CrmActions({ practiceId, failed }: { practiceId: string; failed: number }) {
  const [result, setResult] = useState<SettingsActionResult>({});
  const [pending, startTransition] = useTransition();
  const run = (action: (id: string) => Promise<SettingsActionResult>) => startTransition(async () => setResult(await action(practiceId)));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {failed > 0 ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => run(retryCrmExportsAction)}>
            Tentar de novo
          </Button>
        ) : null}
        <Button type="button" variant="outline" disabled={pending} onClick={() => run(registerCrmWebhookAction)}>
          Registrar o webhook de novo
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Desconectar a SynkronosCRM? A agenda continua funcionando, sem enviar nada à Synkronos e sem receber as ações da secretária.")) run(disconnectCrmAction);
          }}
        >
          Desconectar
        </Button>
      </div>
      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
