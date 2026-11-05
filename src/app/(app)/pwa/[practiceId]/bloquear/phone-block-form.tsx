"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { BlockFields, useBlockForm } from "../../../conta/[practiceId]/_agenda/block-panel";

/** The block's form with fingers in mind: the same fields and rules as the agenda's panel (D-85). */
export function PhoneBlockForm({
  practiceId,
  professionals,
  defaults,
}: {
  practiceId: string;
  professionals: { id: string; name: string }[];
  defaults: Parameters<typeof useBlockForm>[0]["defaults"];
}) {
  const router = useRouter();
  const form = useBlockForm({ practiceId, defaults });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    form.save(() => router.push(`/pwa/${practiceId}`));
  };

  return (
    <form onSubmit={submit} aria-label="Bloqueio" className="flex flex-col gap-3.5 rounded-xl border border-border bg-white p-4">
      <BlockFields form={form} professionals={professionals} inputClass="h-11" />
      <Button type="submit" className="h-11 w-full" disabled={form.pending}>
        {form.pending ? "Salvando…" : "Salvar bloqueio"}
      </Button>
    </form>
  );
}
