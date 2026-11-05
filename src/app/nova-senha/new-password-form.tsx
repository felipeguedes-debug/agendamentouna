"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, buttonClass, Field, inputClass } from "@/components/app-ui";
import { authClient } from "@/lib/auth/client";

export function NewPasswordForm({ token, minPasswordLength }: { token: string; minPasswordLength: number }) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    if (newPassword !== String(form.get("repeat") ?? "")) {
      setError("As duas senhas não são iguais.");
      return;
    }
    setPending(true);
    setError(undefined);
    const { error: failure } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (failure) {
      if (failure.status === 429) setError("Muitas tentativas. Aguarde um pouco e tente de novo.");
      else if (failure.code === "PASSWORD_TOO_SHORT") setError(`A senha precisa ter pelo menos ${minPasswordLength} caracteres.`);
      else setError("Este link não vale mais. Peça outro em Esqueci minha senha.");
      return;
    }
    setSaved(true);
  }

  if (saved) {
    return (
      <div className="flex flex-col gap-3.5">
        <p role="status" className="rounded-[10px] border border-[#EEF1F0] bg-[#F8FAF9] px-3 py-2.5 text-[13.5px] leading-snug text-[#3A4542]">
          Senha salva. Você saiu dos outros aparelhos. Entre com a senha nova.
        </p>
        <Link href="/login" className={`${buttonClass} w-full text-center`}>
          Entrar
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Senha nova" htmlFor="password" hint={`Pelo menos ${minPasswordLength} caracteres.`}>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={minPasswordLength} required className={inputClass} />
      </Field>
      <Field label="Repita a senha" htmlFor="repeat">
        <input id="repeat" name="repeat" type="password" autoComplete="new-password" required className={inputClass} />
      </Field>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Salvando…" : "Salvar senha"}
      </button>
      <p className="rounded-[10px] border border-[#EEF1F0] bg-[#F8FAF9] px-3 py-2.5 text-[13px] leading-snug text-[#3A4542]">
        Ao salvar, você sai dos outros aparelhos. Se usa verificação em duas etapas (2FA), ela continua sendo pedida no login.
      </p>
    </form>
  );
}
