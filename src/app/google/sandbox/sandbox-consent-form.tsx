"use client";

import { useState } from "react";
import { buttonClass, Field, inputClass, secondaryButtonClass } from "@/components/app-ui";

/** Sends the browser back to the callback as Google would: with a code naming the account, or with access_denied. */
export function SandboxConsentForm({ state, redirectUri, loginHint }: { state: string; redirectUri: string; loginHint: string }) {
  const [email, setEmail] = useState(loginHint);
  const answer = (params: Record<string, string>) => {
    const url = new URL(redirectUri, window.location.href);
    if (url.origin !== window.location.origin) return;
    for (const [key, value] of Object.entries({ state, ...params })) url.searchParams.set(key, value);
    window.location.assign(url.toString());
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        answer({ code: `sandbox:${email.trim().toLowerCase()}` });
      }}
    >
      <Field label="Conta Google (de teste)" htmlFor="sandbox-email" hint="O vínculo usa um Google falso, guardado no banco. Qualquer e-mail serve.">
        <input id="sandbox-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
      </Field>
      <div className="flex gap-2">
        <button type="submit" className={`${buttonClass} flex-1`}>
          Autorizar
        </button>
        <button type="button" className={`${secondaryButtonClass} flex-1`} onClick={() => answer({ error: "access_denied" })}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
