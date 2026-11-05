"use client";

import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import type { AppointmentCategory } from "@/generated/prisma/enums";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { useSubmitKeepingValues } from "@/components/use-submit-keeping-values";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_COLORS, TYPE_COLORS } from "@/lib/domain/colors";
import { CATEGORY_LABELS } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { saveAppointmentType, toggleAppointmentType, type TypeFormState } from "./actions";

export type TypeFormValues = {
  id: string | null;
  name: string;
  displayName: string;
  category: AppointmentCategory;
  durationMinutes: string;
  price: string;
  color: string;
  preparation: string;
  cadenceId: string;
  prices: Record<string, string>;
};

export function TypeForm({
  practiceId,
  values,
  categories,
  cadences,
  professionals,
}: {
  practiceId: string;
  values: TypeFormValues;
  categories: AppointmentCategory[];
  cadences: { id: string; name: string }[];
  professionals: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(saveAppointmentType.bind(null, practiceId, values.id), {} as TypeFormState);
  const submit = useSubmitKeepingValues(action);
  const [category, setCategory] = useState(values.category);
  const [color, setColor] = useState(values.color);
  const [colorTouched, setColorTouched] = useState(Boolean(values.id));

  return (
    <form
      action={action}
      onSubmit={submit}
      aria-label={values.id ? `Editar ${values.name}` : "Novo tipo"}
      className="grid gap-4 rounded-xl border-2 border-primary/40 bg-white p-5 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <h2 className="text-base font-semibold">{values.id ? `Editando: ${values.name}` : "Novo tipo de atendimento"}</h2>
        <span className="text-xs text-muted-foreground">Valor e duração são copiados para cada agendamento; mudar aqui não altera os já marcados.</span>
      </div>
      {state.error ? (
        <Alert variant="destructive" className="sm:col-span-2 lg:col-span-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-1.5 lg:col-span-2">
        <Label htmlFor="type-name">Nome</Label>
        <Input id="type-name" name="name" defaultValue={values.name} required maxLength={80} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="type-category">Categoria</Label>
        <NativeSelect
          id="type-category"
          name="category"
          value={category}
          onChange={(event) => {
            const next = event.target.value as AppointmentCategory;
            setCategory(next);
            if (!colorTouched) setColor(CATEGORY_COLORS[next]);
          }}
         
        >
          {categories.map((option) => (
            <option key={option} value={option}>
              {CATEGORY_LABELS[option]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="type-display-name">Nome exibido</Label>
        <Input id="type-display-name" name="displayName" defaultValue={values.displayName} placeholder={CATEGORY_LABELS[category]} maxLength={80} />
        <p className="text-xs text-muted-foreground">No Google e no WhatsApp. Vazio, vale a categoria.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="type-duration">Duração (min)</Label>
        <Input id="type-duration" name="durationMinutes" type="number" min={5} max={480} step={5} defaultValue={values.durationMinutes} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="type-price">Valor (R$)</Label>
        <Input id="type-price" name="price" inputMode="decimal" defaultValue={values.price} placeholder="0,00" required />
      </div>
      <div className="space-y-1.5 lg:col-span-2">
        <Label htmlFor="type-cadence">Régua de lembrete</Label>
        <NativeSelect id="type-cadence" name="cadenceId" defaultValue={values.cadenceId}>
          <option value="">Sem régua</option>
          {cadences.map((cadence) => (
            <option key={cadence.id} value={cadence.id}>
              {cadence.name}
            </option>
          ))}
        </NativeSelect>
      </div>

      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-sm font-medium">Cor</legend>
        <input type="hidden" name="color" value={color} />
        <div className="flex gap-2">
          {TYPE_COLORS.map((option) => (
            <button
              key={option.hex}
              type="button"
              aria-label={option.label}
              aria-pressed={option.hex === color}
              onClick={() => {
                setColor(option.hex);
                setColorTouched(true);
              }}
              className={cn("size-7 rounded-lg border-2", option.hex === color ? "border-foreground" : "border-transparent")}
              style={{ background: option.hex }}
            />
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5 sm:col-span-2">
        <span className="text-sm font-medium">Agendamento online</span>
        <p className="text-sm text-muted-foreground">Fase 3: o paciente ainda não marca sozinho.</p>
      </div>

      <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
        <Label htmlFor="type-preparation">Preparo</Label>
        <Textarea id="type-preparation" name="preparation" defaultValue={values.preparation} rows={2} maxLength={500} placeholder="Jejum, documentos, chegar antes…" />
      </div>

      {professionals.length > 0 ? (
        <fieldset className="space-y-2 sm:col-span-2 lg:col-span-4">
          <legend className="text-sm font-medium">Valor por profissional</legend>
          <p className="text-xs text-muted-foreground">Vazio, vale o valor do tipo.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {professionals.map((professional) => (
              <div key={professional.id} className="space-y-1.5">
                <Label htmlFor={`price-${professional.id}`} className="font-normal">
                  {professional.name}
                </Label>
                <Input id={`price-${professional.id}`} name={`price:${professional.id}`} inputMode="decimal" defaultValue={values.prices[professional.id] ?? ""} placeholder="R$" />
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="flex justify-end gap-2 sm:col-span-2 lg:col-span-4">
        <Link href={`/conta/${practiceId}/tipos`} className={buttonVariants({ variant: "outline", size: "lg" })}>
          Cancelar
        </Link>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Salvando…" : "Salvar tipo"}
        </Button>
      </div>
    </form>
  );
}

export function ToggleTypeButton({ practiceId, typeId, active }: { practiceId: string; typeId: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError((await toggleAppointmentType(practiceId, typeId, !active)).error);
          })
        }
      >
        {active ? "Desativar" : "Reativar"}
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </>
  );
}
