"use client";

import { useActionState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveWhatsappInstanceAction, type ProfileActionResult } from "../actions";

/** The token never comes back: a saved one is only replaced by typing another. */
export function WhatsappInstanceForm({ practiceId, professionalId, apiUrl, phone, hasInstance }: { practiceId: string; professionalId: string; apiUrl: string; phone: string; hasInstance: boolean }) {
  const [state, action, pending] = useActionState(saveWhatsappInstanceAction.bind(null, practiceId, professionalId), {} as ProfileActionResult);
  return (
    <form action={action} className="flex max-w-md flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="whatsapp-url">URL da instância</Label>
        <Input id="whatsapp-url" name="apiUrl" type="url" required defaultValue={apiUrl} placeholder="https://exemplo.uazapi.com" autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="whatsapp-token">Token da instância</Label>
        <Input id="whatsapp-token" name="token" type="password" required={!hasInstance} placeholder={hasInstance ? "Em branco, continua o token salvo" : undefined} autoComplete="off" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="whatsapp-phone">Número conectado</Label>
        <Input id="whatsapp-phone" name="phone" type="tel" required defaultValue={phone} placeholder="(85) 99999-0000" autoComplete="off" />
        <p className="text-xs text-muted-foreground">É por ele que a nota da agenda acha a conversa certa na SynkronosCRM.</p>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.success ? <p className="text-sm text-primary">{state.success}</p> : null}
      <Button type="submit" variant="outline" className="self-start" disabled={pending}>
        {pending ? "Conferindo…" : "Salvar instância"}
      </Button>
    </form>
  );
}
