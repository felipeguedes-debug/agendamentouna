"use client";

import { useActionState, useState, useTransition } from "react";
import { Alert, buttonClass, Field, inputClass } from "@/components/app-ui";
import { cancelInvitation, inviteUser, removeMember, type ActionState } from "./actions";

export function InviteForm({
  practiceId,
  roles,
  professionals,
}: {
  practiceId: string;
  roles: { value: string; label: string }[];
  professionals: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(inviteUser.bind(null, practiceId), {} as ActionState);
  const [role, setRole] = useState(roles[0]?.value ?? "");

  return (
    <form action={action} className="space-y-4">
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.success ? <Alert tone="success">{state.success}</Alert> : null}
      <Field label="E-mail" htmlFor="invite-email" hint="O link de acesso vai para este e-mail e vale por 7 dias.">
        <input id="invite-email" name="email" type="email" required className={inputClass} />
      </Field>
      <Field label="Papel" htmlFor="invite-role">
        <select id="invite-role" name="role" value={role} onChange={(event) => setRole(event.target.value)} className={inputClass}>
          {roles.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      {role === "PROFESSIONAL" ? (
        <Field label="Cadastro do profissional" htmlFor="invite-professional">
          <select id="invite-professional" name="professionalId" required className={inputClass}>
            <option value="">Escolha…</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
        {pending ? "Enviando…" : "Enviar convite"}
      </button>
    </form>
  );
}

export function RowAction({
  kind,
  practiceId,
  id,
  label,
  confirmText,
}: {
  kind: "invitation" | "member";
  practiceId: string;
  id: string;
  label: string;
  confirmText?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        className="text-sm font-medium text-red-700 hover:underline disabled:opacity-60"
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          startTransition(async () => {
            const result = kind === "member" ? await removeMember(practiceId, id) : await cancelInvitation(practiceId, id);
            setError(result.error);
          });
        }}
      >
        {label}
      </button>
      {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
