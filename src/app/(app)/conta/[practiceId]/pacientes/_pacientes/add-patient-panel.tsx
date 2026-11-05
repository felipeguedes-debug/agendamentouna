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
import { MANUAL_CONSENT_CHANNELS, type ManualConsentChannel } from "@/lib/domain/consent";
import { CONSENT_CHANNEL_LABELS } from "@/lib/domain/labels";
import { createPatientAction } from "../../agendamentos/actions";

/**
 * A new patient from the Pacientes screen (D-89): the same data and service as the quick
 * registration inside the booking form (D-22, D-47), which stays.
 */
export function AddPatientPanel({ practiceId, closeHref }: { practiceId: string; closeHref: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [insurance, setInsurance] = useState("Particular");
  const [consents, setConsents] = useState(false);
  const [channel, setChannel] = useState<ManualConsentChannel>("WHATSAPP");
  const [error, setError] = useState<string>();
  const [existing, setExisting] = useState<{ id: string; name: string }>();
  const [pending, startTransition] = useTransition();
  const patientsPath = `/conta/${practiceId}/pacientes`;

  const save = (then: (patientId: string) => string) =>
    startTransition(async () => {
      const result = await createPatientAction(practiceId, { name, phone, insurance, consentChannel: consents ? channel : null });
      setError(result.error);
      setExisting(result.existing);
      if (result.patient) router.push(then(result.patient.id));
    });

  return (
    <UrlPanel
      title="Adicionar paciente"
      description="Depois de salvar, você pode agendar direto."
      closeHref={closeHref}
      footer={
        <span className="ml-auto flex flex-wrap gap-2.5">
          <Link href={closeHref} scroll={false} className={buttonVariants({ variant: "outline", size: "lg" })}>
            Cancelar
          </Link>
          <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => save((id) => `${patientsPath}/${id}`)}>
            Salvar
          </Button>
          <Button type="button" size="lg" disabled={pending} onClick={() => save((id) => `/conta/${practiceId}/agendamentos/novo?paciente=${id}`)}>
            Salvar e agendar
          </Button>
        </span>
      }
    >
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {error}{" "}
            {existing ? (
              <Link href={`${patientsPath}/${existing.id}`} className="font-semibold underline">
                Abrir {existing.name}
              </Link>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="add-patient-name">Nome completo</Label>
        <Input id="add-patient-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-patient-phone">Celular</Label>
        <Input id="add-patient-phone" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" placeholder="(85) 99999-9999" />
        <p className="text-[12.5px] text-muted-foreground">Com DDD. Se o celular já for de outro paciente, avisamos e abrimos o cadastro dele.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-patient-insurance">Convênio</Label>
        <Input id="add-patient-insurance" value={insurance} onChange={(event) => setInsurance(event.target.value)} maxLength={80} />
      </div>
      <fieldset className="flex flex-col gap-3 rounded-[10px] border border-border p-3.5">
        <legend className="px-1.5 text-[13px] font-medium text-[#3A4542]">Lembretes</legend>
        <label className="inline-flex items-center gap-2 text-sm text-[#3A4542]">
          <input type="checkbox" checked={consents} onChange={(event) => setConsents(event.target.checked)} className="size-4 accent-primary" />
          Aceita receber lembretes pelo WhatsApp
        </label>
        {consents ? (
          <div className="space-y-1.5">
            <Label htmlFor="add-patient-channel">Como informou</Label>
            <NativeSelect id="add-patient-channel" value={channel} onChange={(event) => setChannel(event.target.value as ManualConsentChannel)}>
              {MANUAL_CONSENT_CHANNELS.map((option) => (
                <option key={option} value={option}>
                  {CONSENT_CHANNEL_LABELS[option]}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        <p className="text-[12.5px] text-muted-foreground">Sem o aceite, o paciente fica fora da régua. Dá para registrar depois, na ficha.</p>
      </fieldset>
    </UrlPanel>
  );
}
