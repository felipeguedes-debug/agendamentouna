"use client";

import { MapPin } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameProfessionalAction, setProfessionalActiveAction, setProfessionalLocationAction, type ProfileActionResult } from "../actions";

type Location = { id: string; name: string; active: boolean; linked: boolean };

/** The professional's record for the manager (D-91): name, locations and whether they still attend. */
export function ProfessionalSetup({
  practiceId,
  professional,
  hoursHref,
  inviteHref,
}: {
  practiceId: string;
  professional: { id: string; name: string; active: boolean; hasLogin: boolean; locations: Location[] };
  hoursHref: string;
  /** The Usuários screen, when this role may invite a professional. */
  inviteHref: string | null;
}) {
  const [name, setName] = useState(professional.name);
  const [result, setResult] = useState<ProfileActionResult>({});
  const [pending, startTransition] = useTransition();
  const run = (action: () => Promise<ProfileActionResult>) => startTransition(async () => setResult(await action()));

  return (
    <>
      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}

      <section aria-labelledby="professional-record" className="flex flex-col gap-3 rounded-xl border border-border bg-white px-5 py-4">
        <h2 id="professional-record" className="text-[15px] font-semibold">
          Cadastro
        </h2>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(() => renameProfessionalAction(practiceId, professional.id, name));
          }}
        >
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="professional-name">Nome</Label>
            <Input id="professional-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          </div>
          <Button type="submit" variant="outline" size="lg" disabled={pending || name.trim() === professional.name}>
            Salvar nome
          </Button>
        </form>
        <p className="text-[13px] text-muted-foreground" data-testid="professional-login">
          {professional.hasLogin ? "Tem login na agenda." : "Sem login na agenda. "}
          {!professional.hasLogin && inviteHref ? (
            <Link href={inviteHref} className="font-medium text-primary hover:underline">
              Convidar em Usuários
            </Link>
          ) : null}
          {!professional.hasLogin && !inviteHref ? "Quem convida um profissional é o admin da organização." : null}
        </p>
        <div>
          <Button
            type="button"
            variant={professional.active ? "destructive" : "outline"}
            size="lg"
            disabled={pending}
            onClick={() => run(() => setProfessionalActiveAction(practiceId, professional.id, !professional.active))}
          >
            {professional.active ? "Desativar profissional" : "Reativar profissional"}
          </Button>
        </div>
      </section>

      <section aria-labelledby="professional-locations" className="overflow-hidden rounded-xl border border-border bg-white">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-4">
          <h2 id="professional-locations" className="text-[15px] font-semibold">
            Unidades
          </h2>
          <Link href={hoursHref} className={`${buttonVariants({ variant: "link" })} ml-auto h-auto p-0`}>
            Horários e exceções
          </Link>
        </div>
        <ul className="divide-y divide-[#EEF1F0] border-t border-[#EEF1F0]">
          {professional.locations.map((location) => (
            <li key={location.id} data-testid="professional-location" className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
              <MapPin aria-hidden className="size-4 text-muted-foreground" />
              <span className="min-w-0 flex-1 text-sm font-medium">
                {location.name}
                {location.active ? null : <span className="ml-1.5 text-xs font-normal text-muted-foreground">(inativa)</span>}
              </span>
              <span className={location.linked ? "text-[13px] text-primary" : "text-[13px] text-muted-foreground"}>{location.linked ? "Atende aqui" : "Não atende"}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                aria-label={`${location.linked ? "Desligar de" : "Ligar a"} ${location.name}`}
                onClick={() => run(() => setProfessionalLocationAction(practiceId, { professionalId: professional.id, locationId: location.id, linked: !location.linked }))}
              >
                {location.linked ? "Desligar" : "Ligar"}
              </Button>
            </li>
          ))}
        </ul>
        <p className="border-t border-[#EEF1F0] px-5 py-3 text-[12.5px] text-muted-foreground">
          Desligar apaga os horários e as exceções dessa unidade. Com agendamentos pela frente, é preciso remarcar antes.
        </p>
      </section>
    </>
  );
}
