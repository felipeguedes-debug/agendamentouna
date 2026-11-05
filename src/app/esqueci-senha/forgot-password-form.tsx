"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert, buttonClass, Field, inputClass, secondaryButtonClass } from "@/components/app-ui";
import { authClient } from "@/lib/auth/client";

/**
 * Asks for the link through the auth client, so the rate limiter applies. The answer
 * is the same whether or not the email has an account (D-88).
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    setPending(true);
    setError(undefined);
    const { error: failure } = await authClient.requestPasswordReset({ email, redirectTo: "/nova-senha" });
    setPending(false);
    if (failure) {
      setError(failure.status === 429 ? "Muitas tentativas. Aguarde um pouco e tente de novo." : "Não foi possível enviar agora. Tente de novo.");
      return;
    }
    setSent(true);
  }

  const backToLogin = (
    <Link href="/login" className="self-center text-[13.5px] text-primary hover:underline">
      Voltar para o login
    </Link>
  );

  if (sent) {
    return (
      <div className="flex flex-col gap-3.5">
        <div role="status" className="rounded-[10px] border border-[#EEF1F0] bg-[#F8FAF9] px-3 py-2.5 text-[13.5px] leading-snug text-[#3A4542]">
          <strong className="block font-semibold">Confira seu e-mail.</strong>
          Se houver uma conta com esse e-mail, o link chega em alguns minutos. Ele vale por 1 hora e só funciona uma vez. Não chegou? Olhe a caixa de spam ou peça de novo.
        </div>
        <button type="button" className={`${secondaryButtonClass} w-full`} onClick={() => setSent(false)}>
          Enviar de novo
        </button>
        {backToLogin}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="E-mail" htmlFor="email">
        <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Enviando…" : "Enviar link"}
      </button>
      {backToLogin}
    </form>
  );
}
