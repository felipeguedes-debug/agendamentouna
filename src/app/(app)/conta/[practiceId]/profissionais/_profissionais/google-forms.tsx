"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  linkOwnGoogleAction,
  saveBusyCalendarsAction,
  sendGoogleLinkAction,
  setAllDayRuleAction,
  unlinkGoogleAction,
  type ProfileActionResult,
} from "../actions";

function Result({ result }: { result: ProfileActionResult }) {
  if (result.error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{result.error}</AlertDescription>
      </Alert>
    );
  }
  return result.success ? <p className="text-sm text-primary">{result.success}</p> : null;
}

/** The professional authorizes their own Google account (D-01): Google's consent, then back here. */
export function LinkOwnButton({ practiceId, label }: { practiceId: string; label: string }) {
  const [result, setResult] = useState<ProfileActionResult>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" className="self-start" disabled={pending} onClick={() => startTransition(async () => setResult((await linkOwnGoogleAction(practiceId)) ?? {}))}>
        {pending ? "Abrindo o Google…" : label}
      </Button>
      <Result result={result} />
    </div>
  );
}

/** The manager sends the link; the consent is always the professional's (PRD 5, Vínculo). */
export function SendLinkForm({ practiceId, professionalId, hasLogin }: { practiceId: string; professionalId: string; hasLogin: boolean }) {
  const [state, action, pending] = useActionState(sendGoogleLinkAction.bind(null, practiceId, professionalId), {} as ProfileActionResult);
  return (
    <form action={action} className="flex flex-col gap-2">
      <Label htmlFor="google-link-email">E-mail do profissional</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="google-link-email"
          name="email"
          type="email"
          required={!hasLogin}
          placeholder={hasLogin ? "O e-mail de login dele, se ficar vazio" : "nome@exemplo.com"}
          className="max-w-xs"
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Enviando…" : "Enviar link de vínculo"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">O profissional abre o link, entra com a conta Google dele e autoriza. O link vale por 7 dias e funciona uma vez.</p>
      <Result result={state} />
    </form>
  );
}

export function UnlinkButton({ practiceId, professionalId }: { practiceId: string; professionalId: string }) {
  const [result, setResult] = useState<ProfileActionResult>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className="self-start text-destructive"
        disabled={pending}
        onClick={() => {
          if (!window.confirm("Desvincular o Google Agenda? Os compromissos do Google saem da agenda e o calendário do consultório é apagado do Google.")) return;
          startTransition(async () => setResult(await unlinkGoogleAction(practiceId, professionalId)));
        }}
      >
        Desvincular Google Agenda
      </Button>
      <Result result={result} />
    </div>
  );
}

type CalendarOption = { id: string; summary: string; accessRole: string; primary: boolean; ownSecondary: boolean; busy: boolean };

const ROLE_TEXT: Record<string, string> = { owner: "seu", writer: "pode editar", reader: "só leitura", freeBusyReader: "só disponibilidade" };

/** PRD 5, rule 1: which Google calendars count as busy. */
export function BusyCalendarsForm({ practiceId, calendars, chosen }: { practiceId: string; calendars: CalendarOption[]; chosen: boolean }) {
  const [selected, setSelected] = useState(() => new Set(calendars.filter((calendar) => calendar.busy).map((calendar) => calendar.id)));
  const [result, setResult] = useState<ProfileActionResult>({});
  const [pending, startTransition] = useTransition();
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <form
      aria-label="Calendários que contam como ocupado"
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => setResult(await saveBusyCalendarsAction(practiceId, { calendarIds: [...selected] })));
      }}
    >
      <ul className="flex flex-col gap-2">
        {calendars.map((calendar) => (
          <li key={calendar.id}>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                checked={!calendar.ownSecondary && selected.has(calendar.id)}
                disabled={calendar.ownSecondary}
                onChange={(event) => toggle(calendar.id, event.target.checked)}
              />
              <span className="flex flex-col">
                <span className="font-medium">
                  {calendar.summary}
                  {calendar.primary ? " (principal)" : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {calendar.ownSecondary ? "Calendário deste consultório: recebe os atendimentos e nunca vira bloqueio" : ROLE_TEXT[calendar.accessRole] ?? calendar.accessRole}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          Salvar calendários
        </Button>
        {chosen ? (
          <Button type="button" variant="outline" disabled={pending} onClick={() => startTransition(async () => setResult(await saveBusyCalendarsAction(practiceId, { useDefault: true })))}>
            Voltar ao padrão
          </Button>
        ) : null}
      </div>
      <Result result={result} />
    </form>
  );
}

/** D-15: all-day events block by default, since Google creates them free. */
export function AllDayRuleForm({ practiceId, initial }: { practiceId: string; initial: boolean }) {
  const [value, setValue] = useState(initial);
  const [result, setResult] = useState<ProfileActionResult>({});
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-primary"
          checked={value}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.checked;
            setValue(next);
            startTransition(async () => setResult(await setAllDayRuleAction(practiceId, next)));
          }}
        />
        <span>
          Evento de dia inteiro bloqueia a agenda, mesmo marcado como livre no Google
          <span className="block text-xs text-muted-foreground">O Google cria férias e congressos de dia inteiro como livres.</span>
        </span>
      </label>
      <Result result={result} />
    </div>
  );
}
