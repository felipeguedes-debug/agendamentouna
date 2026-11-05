"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UrlPanel } from "@/components/url-panel";
import { createProfessionalAction } from "../actions";

/** A new professional over the list (D-91): the name and where they attend. */
export function AddProfessionalPanel({ practiceId, closeHref, locations }: { practiceId: string; closeHref: string; locations: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [chosen, setChosen] = useState<string[]>(locations.length === 1 ? [locations[0].id] : []);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const toggle = (id: string, on: boolean) => setChosen((current) => (on ? [...current, id] : current.filter((value) => value !== id)));
  const save = () =>
    startTransition(async () => {
      const result = await createProfessionalAction(practiceId, { name, locationIds: chosen });
      setError(result.error);
      if (result.id) router.push(`/conta/${practiceId}/profissionais/${result.id}`);
    });

  return (
    <UrlPanel
      title="Adicionar profissional"
      description="Depois de salvar, ajuste os horários e vincule o Google Agenda."
      closeHref={closeHref}
      footer={
        <span className="ml-auto flex gap-2.5">
          <Link href={closeHref} scroll={false} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Cancelar
          </Link>
          <Button type="button" size="lg" disabled={pending} onClick={save}>
            Salvar
          </Button>
        </span>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="professional-name">Nome</Label>
        <Input id="professional-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} placeholder="Ex.: Dra. Camila Rocha" />
        <p className="text-[12.5px] text-muted-foreground">É o nome que o paciente lê nas mensagens da régua.</p>
      </div>
      <fieldset className="flex flex-col gap-2.5 rounded-[10px] border border-border p-3.5">
        <legend className="px-1.5 text-[13px] font-medium text-[#3A4542]">Unidades em que atende</legend>
        {locations.map((location) => (
          <label key={location.id} className="inline-flex items-center gap-2 text-sm text-[#3A4542]">
            <input type="checkbox" className="size-4 accent-primary" checked={chosen.includes(location.id)} onChange={(event) => toggle(location.id, event.target.checked)} />
            {location.name}
          </label>
        ))}
        {locations.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma unidade ativa. Crie uma em Unidades e horários.</p> : null}
      </fieldset>
    </UrlPanel>
  );
}
