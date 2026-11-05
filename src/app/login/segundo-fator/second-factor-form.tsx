"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, buttonClass, Field, inputClass, linkClass } from "@/components/app-ui";
import { authClient, secondFactorErrorText } from "@/lib/auth/client";

export function SecondFactorForm({ next }: { next: string | undefined }) {
  const router = useRouter();
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(undefined);
    const { error } = useBackupCode
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
    if (error) {
      setError(secondFactorErrorText(error));
      setPending(false);
      return;
    }
    router.replace(next ?? "/");
    router.refresh();
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field
        label={useBackupCode ? "Código de backup" : "Código do aplicativo"}
        htmlFor="code"
        hint={useBackupCode ? "Cada código de backup funciona uma vez." : undefined}
      >
        <input
          key={useBackupCode ? "backup" : "totp"}
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode={useBackupCode ? "text" : "numeric"}
          pattern={useBackupCode ? undefined : "[0-9]{6}"}
          maxLength={useBackupCode ? 32 : 6}
          className={`${inputClass} tracking-widest`}
        />
      </Field>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Verificando…" : "Verificar"}
      </button>
      <div className="flex justify-between text-sm">
        <button type="button" className={linkClass} onClick={() => setUseBackupCode((value) => !value)}>
          {useBackupCode ? "Usar o aplicativo" : "Usar um código de backup"}
        </button>
        <Link href="/login" className="text-zinc-600 hover:underline">
          Voltar
        </Link>
      </div>
    </form>
  );
}
