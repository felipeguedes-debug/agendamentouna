"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useTransition, type FormEvent } from "react";
import { NativeSelect } from "@/components/native-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UrlPanel } from "@/components/url-panel";
import { formatDateBr } from "@/lib/dates/zoned";
import { blockConflictsAction, removeBlockAction, saveBlockAction } from "../agendamentos/block-actions";

type Conflict = Awaited<ReturnType<typeof blockConflictsAction>>[number];

export const GOOGLE_BLOCK_LINE = "No Google Agenda do profissional, sai como “Bloqueado”, sem o motivo.";

/** Fields of a manual block, shared by the panel and the phone's page (D-85). */
export function useBlockForm({
  practiceId,
  defaults,
  block,
}: {
  practiceId: string;
  defaults: { professionalId: string; date: string; startTime: string; endTime: string; allDay: boolean; reason: string };
  block?: { id: string };
}) {
  const [professionalId, setProfessionalId] = useState(defaults.professionalId);
  const [date, setDate] = useState(defaults.date);
  const [startTime, setStartTime] = useState(defaults.startTime);
  const [endTime, setEndTime] = useState(defaults.endTime);
  const [allDay, setAllDay] = useState(defaults.allDay);
  const [reason, setReason] = useState(defaults.reason);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!professionalId || !date || (!allDay && (!startTime || !endTime || startTime >= endTime))) return;
    let current = true;
    blockConflictsAction(practiceId, { professionalId, date, startTime, endTime, allDay })
      .then((found) => current && setConflicts(found))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [practiceId, professionalId, date, startTime, endTime, allDay]);

  const save = (then: () => void) =>
    startTransition(async () => {
      const result = await saveBlockAction(practiceId, block?.id ?? null, { professionalId, date, startTime, endTime, allDay, reason });
      setError(result.error);
      if (!result.error) then();
    });
  const remove = (then: () => void) =>
    startTransition(async () => {
      if (!block) return;
      const result = await removeBlockAction(practiceId, block.id);
      setError(result.error);
      if (!result.error) then();
    });

  return {
    fields: { professionalId, setProfessionalId, date, setDate, startTime, setStartTime, endTime, setEndTime, allDay, setAllDay, reason, setReason },
    conflicts: !professionalId || !date ? [] : conflicts,
    error,
    pending,
    save,
    remove,
  };
}

export function BlockFields({
  form,
  professionals,
  inputClass,
}: {
  form: ReturnType<typeof useBlockForm>;
  professionals: { id: string; name: string }[];
  inputClass?: string;
}) {
  const { fields } = form;
  return (
    <>
      {form.error ? (
        <Alert variant="destructive">
          <AlertDescription>{form.error}</AlertDescription>
        </Alert>
      ) : null}
      {professionals.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="block-professional">Profissional</Label>
          <NativeSelect id="block-professional" className={inputClass} value={fields.professionalId} onChange={(event) => fields.setProfessionalId(event.target.value)} required>
            <option value="">Escolha…</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-3 space-y-1.5 sm:col-span-1">
          <Label htmlFor="block-date">Data</Label>
          <Input id="block-date" type="date" className={inputClass} value={fields.date} onChange={(event) => fields.setDate(event.target.value)} required />
        </div>
        <div className="col-span-3 grid grid-cols-2 gap-3 sm:col-span-2">
          <div className="space-y-1.5">
            <Label htmlFor="block-start">Início</Label>
            <Input id="block-start" type="time" step={300} className={inputClass} value={fields.startTime} onChange={(event) => fields.setStartTime(event.target.value)} disabled={fields.allDay} required={!fields.allDay} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="block-end">Fim</Label>
            <Input id="block-end" type="time" step={300} className={inputClass} value={fields.endTime} onChange={(event) => fields.setEndTime(event.target.value)} disabled={fields.allDay} required={!fields.allDay} />
          </div>
        </div>
      </div>
      <label className="inline-flex items-center gap-2 text-sm text-[#3A4542]">
        <input type="checkbox" className="size-4 accent-primary" checked={fields.allDay} onChange={(event) => fields.setAllDay(event.target.checked)} />
        Dia inteiro
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="block-reason">Motivo</Label>
        <Input id="block-reason" className={inputClass} value={fields.reason} onChange={(event) => fields.setReason(event.target.value)} maxLength={200} placeholder="Ex.: reunião, compromisso externo" required />
        <p className="text-[12.5px] text-muted-foreground">Aparece na agenda para a equipe. Não vai para o paciente.</p>
      </div>
      {form.conflicts.length > 0 ? (
        <div data-testid="block-conflicts" role="status" className="rounded-[10px] border border-[#FCD9A6] bg-[#FEF3E2] px-3 py-2.5 text-[13px] leading-snug text-[#92400E]">
          <strong className="font-semibold">{form.conflicts.length === 1 ? "1 agendamento neste período:" : `${form.conflicts.length} agendamentos neste período:`}</strong>{" "}
          {form.conflicts.map((conflict) => `${conflict.patientName}, ${formatDateBr(conflict.date).slice(0, 5)} às ${conflict.time}`).join("; ")}. O bloqueio não cancela o atendimento. Se precisar, remarque.
        </div>
      ) : null}
      <p className="rounded-[10px] border border-[#EEF1F0] bg-[#F8FAF9] px-3 py-2.5 text-[13px] leading-snug text-[#3A4542]">{GOOGLE_BLOCK_LINE}</p>
    </>
  );
}

/** Create or edit a manual block over the agenda (PRD 4, rule 2; D-85). */
export function BlockPanel({
  practiceId,
  closeHref,
  professionals,
  defaults,
  block,
}: {
  practiceId: string;
  closeHref: string;
  professionals: { id: string; name: string }[];
  defaults: { professionalId: string; date: string; startTime: string; endTime: string; allDay: boolean; reason: string };
  block?: { id: string; createdByName: string | null; createdAt: { date: string; time: string } };
}) {
  const router = useRouter();
  const single = professionals.length === 1 ? professionals[0].id : "";
  const form = useBlockForm({ practiceId, block, defaults: { ...defaults, professionalId: defaults.professionalId || single } });
  const close = () => router.push(closeHref, { scroll: false });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    form.save(close);
  };

  return (
    <UrlPanel
      title={block ? "Bloqueio" : "Bloquear horário"}
      closeHref={closeHref}
      description={
        block?.createdByName
          ? `Criado por ${block.createdByName} em ${formatDateBr(block.createdAt.date).slice(0, 5)}, às ${block.createdAt.time}.`
          : "O horário fica indisponível para novos agendamentos."
      }
      footer={
        <>
          {block ? (
            <Button type="button" variant="destructive" size="lg" disabled={form.pending} onClick={() => form.remove(close)}>
              Remover bloqueio
            </Button>
          ) : null}
          <span className="ml-auto flex gap-2.5">
            <Link href={closeHref} scroll={false} className={buttonVariants({ variant: "outline", size: "lg" })}>
              Cancelar
            </Link>
            <Button type="submit" form="block-form" size="lg" disabled={form.pending}>
              {form.pending ? "Salvando…" : block ? "Salvar" : "Salvar bloqueio"}
            </Button>
          </span>
        </>
      }
    >
      <form id="block-form" onSubmit={submit} aria-label="Bloqueio" className="flex flex-col gap-4">
        <BlockFields form={form} professionals={professionals} />
      </form>
    </UrlPanel>
  );
}
