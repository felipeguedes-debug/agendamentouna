"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UrlPanel } from "@/components/url-panel";
import { saveLocationAction, setLocationActiveAction, type ActionResult } from "../actions";

type Location = { id: string; name: string; address: string; timeZone: string; active: boolean };

/** Add or edit a location over the list (D-86). The address is what the cadence's messages say. */
export function LocationPanel({
  practiceId,
  closeHref,
  location,
  timeZones,
}: {
  practiceId: string;
  closeHref: string;
  location: Location | null;
  timeZones: readonly { value: string; label: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState(location?.name ?? "");
  const [address, setAddress] = useState(location?.address ?? "");
  const [timeZone, setTimeZone] = useState(location?.timeZone ?? timeZones[0].value);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action();
      setError(result.error);
      if (!result.error) router.push(closeHref, { scroll: false });
    });

  return (
    <UrlPanel
      title={location ? location.name : "Adicionar unidade"}
      description={location ? undefined : "Depois, ligue os profissionais a ela em Horários e exceções."}
      closeHref={closeHref}
      footer={
        <>
          {location ? (
            <Button type="button" variant={location.active ? "destructive" : "outline"} size="lg" disabled={pending} onClick={() => run(() => setLocationActiveAction(practiceId, location.id, !location.active))}>
              {location.active ? "Desativar unidade" : "Reativar unidade"}
            </Button>
          ) : null}
          <span className="ml-auto flex gap-2.5">
            <Link href={closeHref} scroll={false} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Cancelar
            </Link>
            <Button type="button" size="lg" disabled={pending} onClick={() => run(() => saveLocationAction(practiceId, { id: location?.id, name, address, timeZone }))}>
              Salvar
            </Button>
          </span>
        </>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="location-name">Nome</Label>
        <Input id="location-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="location-address">Endereço</Label>
        <Input id="location-address" value={address} onChange={(event) => setAddress(event.target.value)} maxLength={200} />
        <p className="text-[12.5px] text-muted-foreground">É o endereço que vai nas mensagens da régua.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="location-zone">Fuso horário</Label>
        <NativeSelect id="location-zone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
          {timeZones.map((zone) => (
            <option key={zone.value} value={zone.value}>
              {zone.label}
            </option>
          ))}
        </NativeSelect>
        <p className="text-[12.5px] text-muted-foreground">Horários da agenda e janela de envio usam este fuso.</p>
      </div>
    </UrlPanel>
  );
}
