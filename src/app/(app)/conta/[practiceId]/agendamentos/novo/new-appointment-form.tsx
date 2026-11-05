"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import type { AppointmentCategory, AppointmentStatus } from "@/generated/prisma/enums";
import { NativeSelect } from "@/components/native-select";
import { useSubmitKeepingValues } from "@/components/use-submit-keeping-values";
import { isCanceled } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDateBr, formatLongDate } from "@/lib/dates/zoned";
import { tintOf } from "@/lib/domain/colors";
import { MANUAL_CONSENT_CHANNELS, type ManualConsentChannel } from "@/lib/domain/consent";
import { CONSENT_CHANNEL_LABELS, LEAD_SOURCE_LABELS } from "@/lib/domain/labels";
import { formatCents } from "@/lib/domain/money";
import { daySlots } from "@/lib/agenda/slots";
import { firstName } from "@/lib/google/rules";
import type { PatientOption } from "@/lib/patients/patients";
import { cn } from "@/lib/utils";
import {
  createAppointmentAction,
  createPatientAction,
  dayPreviewAction,
  searchPatientsAction,
  type ActionResult,
} from "../actions";

/** googleCalendar: the professional has the practice's secondary calendar in Google (D-62). */
type Professional = { id: string; name: string; locations: { id: string; name: string }[]; googleCalendar: boolean };
type AppointmentTypeOption = {
  id: string;
  name: string;
  category: AppointmentCategory;
  /** What Google and WhatsApp show (D-14). */
  displayLabel: string;
  color: string;
  durationMinutes: number;
  defaultPriceCents: number;
  prices: Record<string, number>;
  cadenceName: string | null;
  cadenceSteps: string[];
};
type DayPreview = Awaited<ReturnType<typeof dayPreviewAction>>;

const SEARCH_DELAY_MS = 250;

function centsToInput(cents: number) {
  return formatCents(cents).replace("R$ ", "");
}

export function NewAppointmentForm({
  practiceId,
  practiceName,
  canEditPrice,
  canOverbook,
  defaults,
  professionals,
  types,
}: {
  practiceId: string;
  practiceName: string;
  canEditPrice: boolean;
  canOverbook: boolean;
  defaults: { date: string; time: string; professionalId: string; patient: PatientOption | null };
  professionals: Professional[];
  types: AppointmentTypeOption[];
}) {
  const [state, action, saving] = useActionState(createAppointmentAction.bind(null, practiceId), {} as ActionResult);
  const submit = useSubmitKeepingValues(action);
  const [patient, setPatient] = useState<PatientOption | null>(defaults.patient);
  const [professionalId, setProfessionalId] = useState(defaults.professionalId);
  const professional = professionals.find((candidate) => candidate.id === professionalId);
  const [locationId, setLocationId] = useState(professional?.locations[0]?.id ?? "");
  const [typeId, setTypeId] = useState("");
  const type = types.find((candidate) => candidate.id === typeId);
  const [date, setDate] = useState(defaults.date);
  const [time, setTime] = useState(defaults.time);
  const [duration, setDuration] = useState("");
  const [price, setPrice] = useState("");
  const [insurance, setInsurance] = useState(defaults.patient?.insurance ?? "Particular");
  const [preview, setPreview] = useState<DayPreview>(null);
  const [, startPreview] = useTransition();

  const typePrice = type ? (type.prices[professionalId] ?? type.defaultPriceCents) : null;

  useEffect(() => {
    if (!professionalId || !date) return;
    startPreview(async () => setPreview(await dayPreviewAction(practiceId, professionalId, date)));
  }, [practiceId, professionalId, date]);

  function chooseProfessional(id: string) {
    setProfessionalId(id);
    const next = professionals.find((candidate) => candidate.id === id);
    if (!next?.locations.some((location) => location.id === locationId)) setLocationId(next?.locations[0]?.id ?? "");
    const nextType = types.find((candidate) => candidate.id === typeId);
    if (nextType) setPrice(centsToInput(nextType.prices[id] ?? nextType.defaultPriceCents));
  }

  function chooseType(id: string) {
    setTypeId(id);
    const next = types.find((candidate) => candidate.id === id);
    if (!next) return;
    setDuration(String(next.durationMinutes));
    setPrice(centsToInput(next.prices[professionalId] ?? next.defaultPriceCents));
  }

  function choosePatient(option: PatientOption | null) {
    setPatient(option);
    if (option) setInsurance(option.insurance);
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-wrap overflow-hidden rounded-[14px] border border-border bg-white">
      <form action={action} onSubmit={submit} className="flex min-w-0 flex-[999_1_520px] flex-col gap-5 p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Novo agendamento</h1>
          <span className="text-xs text-muted-foreground">{practiceName}</span>
          <Link href={`/conta/${practiceId}`} aria-label="Fechar" className={cn(buttonVariants({ variant: "outline", size: "icon" }), "ml-auto")}>
            ×
          </Link>
        </div>

        {state.error ? (
          <Alert variant="destructive">
            <AlertDescription>
              {state.error}
              {state.details?.length ? (
                <ul className="mt-1 list-disc pl-4">
                  {state.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <PatientPicker practiceId={practiceId} patient={patient} onChange={choosePatient} />
        <input type="hidden" name="patientId" value={patient?.id ?? ""} />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Tipo de atendimento</legend>
          <div className="flex flex-wrap gap-2">
            {types.map((option) => (
              <label
                key={option.id}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                  option.id === typeId ? "border-2 font-semibold" : "border-input bg-white",
                )}
                style={option.id === typeId ? { borderColor: option.color, background: tintOf(option.color) } : undefined}
              >
                <input type="radio" name="appointmentTypeId" value={option.id} checked={option.id === typeId} onChange={() => chooseType(option.id)} className="sr-only" required />
                <span className="size-2 rounded-full" style={{ background: option.color }} />
                {option.name}
              </label>
            ))}
          </div>
          {type ? (
            <p className="text-[13px] text-[#3A4542]">
              {type.durationMinutes} min · {formatCents(typePrice!, { compact: true })} · Régua {type.cadenceName ?? "nenhuma"}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="professional">Profissional</Label>
            <NativeSelect id="professional" name="professionalId" value={professionalId} onChange={(event) => chooseProfessional(event.target.value)} required>
              {professionals.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Unidade</Label>
            <NativeSelect id="location" name="locationId" value={locationId} onChange={(event) => setLocationId(event.target.value)} required>
              {professional?.locations.length ? null : <option value="">Sem unidade</option>}
              {professional?.locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>


        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="date">Data</Label>
            <Input id="date" name="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="time">Hora</Label>
            <Input id="time" name="time" type="time" step={300} value={time} onChange={(event) => setTime(event.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duration">Duração (min)</Label>
            <Input id="duration" name="durationMinutes" type="number" min={5} max={480} step={5} value={duration} onChange={(event) => setDuration(event.target.value)} />
          </div>
        </div>

        <details className="border-t border-[#EEF1F0] pt-3.5">
          <summary className="cursor-pointer text-[13px] font-semibold text-[#3A4542]">Mais detalhes: {canEditPrice ? "valor, " : ""}convênio, origem do lead e observação</summary>
          <div className="flex flex-col gap-4 pt-3.5">
            <div className={cn("grid gap-4", canEditPrice ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              {canEditPrice ? (
                <div className="space-y-1.5">
                  <Label htmlFor="price">Valor (R$)</Label>
                  <Input id="price" name="price" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="insurance">Convênio</Label>
                <Input id="insurance" name="insurance" value={insurance} onChange={(event) => setInsurance(event.target.value)} maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lead-source">Origem do lead</Label>
                <NativeSelect id="lead-source" name="leadSource" defaultValue="">
                  <option value="">Não informada</option>
                  {Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="internal-note">
                Observação interna <span className="font-normal text-muted-foreground">(não vai para o paciente nem para o Google)</span>
              </Label>
              <Textarea id="internal-note" name="internalNote" rows={2} maxLength={1000} placeholder="Ex.: paciente pediu horário no início da manhã" />
            </div>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3 border-t border-[#EEF1F0] pt-4">
          {canOverbook && state.details?.length ? (
            <label className="inline-flex items-center gap-2 text-sm text-[#3A4542]">
              <input type="checkbox" name="allowConflict" className="size-4 accent-primary" />
              Encaixe: marcar mesmo com conflito de horário
            </label>
          ) : null}
          <Link href={`/conta/${practiceId}`} className={cn(buttonVariants({ variant: "outline", size: "lg" }), "ml-auto")}>
            Cancelar
          </Link>
          <Button type="submit" size="lg" disabled={saving || !patient}>
            {saving ? "Salvando…" : "Salvar agendamento"}
          </Button>
        </div>
      </form>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 border-l border-border bg-[#F8FAF9] p-6">
        <DayPreviewPanel date={date} professionalName={professional?.name ?? ""} preview={preview} time={time} onChooseTime={setTime} />
        {type?.cadenceSteps.length ? (
          <details className="rounded-[10px] border border-border bg-white text-[12.5px] text-[#3A4542]">
            <summary className="cursor-pointer px-3 py-2.5 font-semibold">
              Régua: {type.cadenceSteps.length} {type.cadenceSteps.length === 1 ? "mensagem" : "mensagens"} pelo WhatsApp
            </summary>
            <div className="flex flex-col gap-2 px-3 pb-3">
              <ol className="flex flex-col gap-1.5">
                {type.cadenceSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p className="text-[11px] text-muted-foreground">Os lembretes saem pelo WhatsApp do profissional. Paciente sem consentimento fica fora da régua.</p>
            </div>
          </details>
        ) : null}
        {professional?.googleCalendar && type ? (
          <details className="rounded-[10px] border border-border bg-white text-[12.5px] text-[#3A4542]">
            <summary className="cursor-pointer px-3 py-2.5 font-semibold">Google Agenda</summary>
            <p className="px-3 pb-3" data-testid="google-preview">
              Evento &quot;{patient ? firstName(patient.name) : "Paciente"} · {type.displayLabel}&quot; será criado no calendário &quot;{practiceName}&quot;.
            </p>
          </details>
        ) : null}
      </aside>
    </div>
  );
}

function PatientPicker({
  practiceId,
  patient,
  onChange,
}: {
  practiceId: string;
  patient: PatientOption | null;
  onChange: (patient: PatientOption | null) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PatientOption[]>([]);
  const [searched, setSearched] = useState("");
  const [creating, setCreating] = useState(false);
  const [, startSearch] = useTransition();

  useEffect(() => {
    if (patient || term.trim().length < 2) return;
    const timer = setTimeout(() => {
      startSearch(async () => {
        setResults(await searchPatientsAction(practiceId, term));
        setSearched(term);
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [practiceId, patient, term]);

  if (patient) {
    return (
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Paciente</span>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary bg-accent px-3 py-2.5">
          <span className="flex flex-col">
            <span className="font-semibold" data-testid="selected-patient">
              {patient.name}
            </span>
            <span className="text-xs text-muted-foreground">
              {[patient.phone, patient.insurance].filter(Boolean).join(" · ")}
            </span>
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
            Trocar
          </Button>
        </div>
      </div>
    );
  }

  const showResults = term.trim().length >= 2 && searched === term;
  return (
    <div className="space-y-1.5">
      <Label htmlFor="patient-search">Paciente</Label>
      <Input
        id="patient-search"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setCreating(false);
        }}
        placeholder="Nome ou celular"
        autoComplete="off"
      />
      {showResults && !creating ? (
        <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-white shadow-[0_6px_20px_rgba(20,31,30,0.08)]" role="listbox" aria-label="Pacientes encontrados">
          {results.map((option) => (
            <button
              key={option.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onChange(option)}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-accent"
            >
              <span className="flex flex-col">
                <span className="font-semibold">{option.name}</span>
                <span className="text-xs text-muted-foreground">
                  {option.phone || "sem celular"} · {option.lastVisitAt ? `último atendimento ${formatDateBr(option.lastVisitAt.toISOString().slice(0, 10))}` : "nunca atendido"}
                </span>
              </span>
              {option.acceptsWhatsapp ? <span className="text-[11px] font-semibold text-primary">Aceita WhatsApp</span> : null}
            </button>
          ))}
          <button type="button" onClick={() => setCreating(true)} className="border-t border-[#EEF1F0] px-3 py-2.5 text-left font-semibold text-primary hover:bg-accent">
            + Cadastrar novo paciente &quot;{term.trim()}&quot;
          </button>
        </div>
      ) : null}
      {creating ? <QuickPatientForm practiceId={practiceId} term={term} onCreated={onChange} onCancel={() => setCreating(false)} /> : null}
    </div>
  );
}

/** Quick registration inline (D-22): name, phone, insurance and the contact consent, when collected (D-47). */
function QuickPatientForm({
  practiceId,
  term,
  onCreated,
  onCancel,
}: {
  practiceId: string;
  term: string;
  onCreated: (patient: PatientOption) => void;
  onCancel: () => void;
}) {
  const typedPhone = /\d{4}/.test(term);
  const [name, setName] = useState(typedPhone ? "" : term.trim());
  const [phone, setPhone] = useState(typedPhone ? term.trim() : "");
  const [insurance, setInsurance] = useState("Particular");
  const [consents, setConsents] = useState(false);
  const [channel, setChannel] = useState<ManualConsentChannel>("WHATSAPP");
  const [error, setError] = useState<string>();
  const [existing, setExisting] = useState<{ id: string; name: string }>();
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createPatientAction(practiceId, { name, phone, insurance, consentChannel: consents ? channel : null });
      if (result.patient) onCreated(result.patient);
      setError(result.error);
      setExisting(result.existing);
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-[#F8FAF9] p-3 sm:grid-cols-3" aria-label="Cadastro rápido de paciente" role="group">
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {error}{" "}
          {existing ? (
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => onCreated({ id: existing.id, name: existing.name, phone, insurance, lastVisitAt: null, acceptsWhatsapp: false })}
            >
              Usar {existing.name}
            </button>
          ) : null}
        </p>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="new-patient-name">Nome do paciente</Label>
        <Input id="new-patient-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-patient-phone">Celular</Label>
        <Input id="new-patient-phone" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="(85) 99999-9999" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-patient-insurance">Convênio do paciente</Label>
        <Input id="new-patient-insurance" value={insurance} onChange={(event) => setInsurance(event.target.value)} maxLength={80} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-3">
        <label className="inline-flex items-center gap-2 text-sm text-[#3A4542]">
          <input type="checkbox" checked={consents} onChange={(event) => setConsents(event.target.checked)} className="size-4 accent-primary" />
          Aceita receber lembretes pelo WhatsApp
        </label>
        {consents ? (
          <span className="inline-flex items-center gap-2">
            <Label htmlFor="new-patient-consent-channel" className="font-normal text-muted-foreground">
              Como aceitou
            </Label>
            <NativeSelect
              id="new-patient-consent-channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value as ManualConsentChannel)}
              className="w-40"
            >
              {MANUAL_CONSENT_CHANNELS.map((option) => (
                <option key={option} value={option}>
                  {CONSENT_CHANNEL_LABELS[option]}
                </option>
              ))}
            </NativeSelect>
          </span>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Voltar
        </Button>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Cadastrando…" : "Cadastrar paciente"}
        </Button>
      </div>
    </div>
  );
}

function DayPreviewPanel({
  date,
  professionalName,
  preview,
  time,
  onChooseTime,
}: {
  date: string;
  professionalName: string;
  preview: DayPreview;
  time: string;
  onChooseTime: (time: string) => void;
}) {
  const slots = preview ? daySlots(preview.workingHours, preview.items) : [];
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {date ? formatLongDate(date) : "Escolha a data"} · {professionalName}
      </h2>
      {preview?.exceptions.map((exception) => (
        <p key={exception.reason} className="rounded-lg bg-[#FEF3E2] px-3 py-2 text-xs text-[#B45309]">
          Sem atendimento: {exception.reason}
          {exception.locationName ? ` (${exception.locationName})` : ""}
        </p>
      ))}
      {preview ? (
        <p className="text-xs text-muted-foreground">
          {preview.workingHours.length > 0
            ? `Atende ${preview.workingHours.map((hours) => `${hours.startTime}–${hours.endTime} (${hours.locationName})`).join(", ")}`
            : "Sem horário de atendimento cadastrado neste dia."}
        </p>
      ) : null}
      <ol className="flex flex-col gap-1.5">
        {preview && slots.length === 0 ? <li className="rounded-lg border border-dashed border-[#B8C2BE] bg-white px-3 py-2 text-xs text-muted-foreground">Dia livre</li> : null}
        {slots.map((slot) => {
          if (slot.kind === "free") {
            return (
              <li key={`free-${slot.time}`} className="flex">
                <button
                  type="button"
                  onClick={() => onChooseTime(slot.time)}
                  aria-pressed={slot.time === time}
                  className={cn(
                    "flex flex-1 items-center gap-2.5 rounded-lg border border-dashed border-input bg-white px-3 py-2 text-left text-xs text-muted-foreground hover:border-primary hover:text-primary",
                    slot.time === time && "border-2 border-solid border-primary bg-accent font-semibold text-primary",
                  )}
                >
                  <span className="w-10 font-semibold tabular-nums">{slot.time}</span>
                  {slot.time === time ? "Horário escolhido" : "Livre, usar este horário"}
                </button>
              </li>
            );
          }
          const { item } = slot;
          return (
            <li key={`${item.kind}-${item.id}`} className="flex items-center gap-2.5 rounded-lg border border-border bg-white px-3 py-2 text-xs">
              <span className="w-10 font-semibold text-muted-foreground tabular-nums">{item.time}</span>
              {item.kind === "appointment" ? (
                <span className={cn(isCanceled(item.status as AppointmentStatus) && "text-[#B91C1C]")}>
                  {item.patientName} · {isCanceled(item.status) ? "cancelado" : item.typeName}
                </span>
              ) : (
                <span className="text-muted-foreground">{item.source === "GOOGLE" ? "Compromisso Google" : `Bloqueio${item.reason ? `: ${item.reason}` : ""}`} até {item.endTime}</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
