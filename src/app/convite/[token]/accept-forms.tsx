"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, buttonClass, Field, inputClass, linkClass } from "@/components/app-ui";
import { acceptAsExistingUser, acceptAsNewUser, type AcceptState } from "./actions";

export function NewUserForm({ token, email, minPasswordLength }: { token: string; email: string; minPasswordLength: number }) {
  const [state, action, pending] = useActionState(acceptAsNewUser.bind(null, token), {} as AcceptState);
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <Field label="E-mail" htmlFor="email">
        <input id="email" type="email" value={email} readOnly disabled className={inputClass} />
      </Field>
      <Field label="Seu nome" htmlFor="name">
        <input id="name" name="name" autoComplete="name" required className={inputClass} />
      </Field>
      <Field label="Senha" htmlFor="password" hint={`Pelo menos ${minPasswordLength} caracteres.`}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={minPasswordLength}
          maxLength={128}
          required
          className={inputClass}
        />
      </Field>
      <Field label="Repita a senha" htmlFor="passwordConfirmation">
        <input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
          className={inputClass}
        />
      </Field>
      <label className="flex items-start gap-2 text-sm text-zinc-700">
        <input name="acceptTerms" type="checkbox" required className="mt-0.5 size-4 accent-teal-700" />
        <span>
          Li e aceito os{" "}
          <Link href="/termos" target="_blank" className={linkClass}>
            termos de uso
          </Link>
          .
        </span>
      </label>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Criando acesso…" : "Criar acesso"}
      </button>
    </form>
  );
}

export function AcceptExistingForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptAsExistingUser.bind(null, token), {} as AcceptState);
  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      <p className="text-sm text-zinc-700">Aceite para ver esta conta no seletor, junto das que você já tem.</p>
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Aceitando…" : "Aceitar convite"}
      </button>
    </form>
  );
}
