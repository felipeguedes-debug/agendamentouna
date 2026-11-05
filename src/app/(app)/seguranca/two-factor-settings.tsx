"use client";

import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState, type FormEvent } from "react";
import { Alert, buttonClass, Field, inputClass, secondaryButtonClass } from "@/components/app-ui";
import { authClient } from "@/lib/auth/client";

type Setup = { qrCode: string; secret: string; backupCodes: string[] };

function passwordErrorText(error: { status?: number; code?: string }) {
  if (error.code === "INVALID_PASSWORD") return "Senha incorreta.";
  if (error.code === "TWO_FACTOR_REQUIRED_BY_PRACTICE") {
    return "Uma das suas contas exige verificação em duas etapas; ela não pode ser desativada.";
  }
  if (error.status === 429) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  return "Não foi possível concluir. Tente de novo.";
}

export function TwoFactorSettings({ enabled, required }: { enabled: boolean; required: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup>();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    setError(undefined);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (error || data?.method !== "totp") {
      setError(error ? passwordErrorText(error) : "Não foi possível começar. Tente de novo.");
      return;
    }
    setSetup({
      qrCode: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }),
      secret: new URL(data.totpURI).searchParams.get("secret") ?? "",
      backupCodes: data.backupCodes,
    });
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(undefined);
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    if (error) {
      setError("Código inválido. Confira o horário do celular e tente de novo.");
      setPending(false);
      return;
    }
    setSetup(undefined);
    setPending(false);
    router.refresh();
  }

  async function disable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    setError(undefined);
    const { error } = await authClient.twoFactor.disable({ password });
    setPending(false);
    if (error) {
      setError(passwordErrorText(error));
      return;
    }
    router.refresh();
  }

  if (enabled) {
    return (
      <div className="space-y-6">
        <Alert tone="success">A verificação em duas etapas está ativada.</Alert>
        {required ? (
          <p className="text-sm text-zinc-600">Uma das suas contas exige a verificação; ela não pode ser desativada.</p>
        ) : (
          <form onSubmit={disable} className="space-y-4">
            {error ? <Alert>{error}</Alert> : null}
            <Field label="Senha atual" htmlFor="disable-password">
              <input id="disable-password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
            </Field>
            <button type="submit" disabled={pending} className={secondaryButtonClass}>
              Desativar verificação em duas etapas
            </button>
          </form>
        )}
      </div>
    );
  }

  if (setup) {
    return (
      <div className="space-y-6">
        <ol className="list-decimal space-y-4 pl-5 text-sm text-zinc-700">
          <li>
            No aplicativo autenticador, leia o QR Code. Se não conseguir, digite a chave.
            <div className="mt-3 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated in the browser */}
              <img src={setup.qrCode} alt="QR Code para o aplicativo autenticador" width={200} height={200} className="rounded border border-zinc-200" />
              <code className="break-all rounded bg-zinc-100 px-2 py-1 font-mono text-xs">{setup.secret}</code>
            </div>
          </li>
          <li>
            Guarde estes códigos de backup em lugar seguro. Cada um entra uma vez, se você perder o celular.
            <ul className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs sm:grid-cols-5">
              {setup.backupCodes.map((code) => (
                <li key={code} className="rounded bg-zinc-100 px-2 py-1 text-center">
                  {code}
                </li>
              ))}
            </ul>
          </li>
          <li>Digite o código que o aplicativo mostra agora.</li>
        </ol>
        <form onSubmit={confirm} className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}
          <Field label="Código do aplicativo" htmlFor="code">
            <input
              id="code"
              name="code"
              required
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              className={`${inputClass} max-w-40 tracking-widest`}
            />
          </Field>
          <button type="submit" disabled={pending} className={buttonClass}>
            {pending ? "Ativando…" : "Ativar"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={start} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Senha atual" htmlFor="password" hint="Para começar, confirme sua senha.">
        <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
      </Field>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Preparando…" : "Configurar verificação em duas etapas"}
      </button>
    </form>
  );
}
