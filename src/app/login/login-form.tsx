"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, buttonClass, Field, inputClass, secondaryButtonClass } from "@/components/app-ui";
import { authClient, signInErrorText } from "@/lib/auth/client";
import { withNext } from "@/lib/auth/redirects";

export function LoginForm({
  next,
  googleEnabled,
  initialError,
}: {
  next: string | undefined;
  googleEnabled: boolean;
  initialError: string | undefined;
}) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);

  async function signInWithPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(undefined);
    const { data, error } = await authClient.signIn.email({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    if (error) {
      setError(signInErrorText(error));
      setPending(false);
      return;
    }
    // Two-factor on: the session only exists after the code (D-16).
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
      router.push(withNext("/login/segundo-fator", next));
      return;
    }
    router.replace(next ?? "/");
    router.refresh();
  }

  async function signInWithGoogle() {
    setPending(true);
    setError(undefined);
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: next ?? "/",
      errorCallbackURL: "/login",
    });
    if (error) {
      setError("Não foi possível entrar com o Google. Tente de novo.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}
      <form onSubmit={signInWithPassword} className="space-y-4">
        <Field label="E-mail" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required className={inputClass} />
        </Field>
        <Field label="Senha" htmlFor="password">
          <input id="password" name="password" type="password" autoComplete="current-password" required className={inputClass} />
        </Field>
        <p className="-mt-2 text-right text-[13px]">
          <Link href="/esqueci-senha" className="text-primary hover:underline">
            Esqueci minha senha
          </Link>
        </p>
        <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
      {googleEnabled ? (
        <>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span className="h-px flex-1 bg-zinc-200" />
            ou
            <span className="h-px flex-1 bg-zinc-200" />
          </div>
          <button type="button" onClick={signInWithGoogle} disabled={pending} className={`${secondaryButtonClass} w-full`}>
            Entrar com Google
          </button>
          <p className="text-xs text-zinc-500">
            O Google só informa seu nome e e-mail. O acesso ao Google Agenda é pedido à parte, no perfil do profissional.
          </p>
        </>
      ) : null}
    </div>
  );
}
