"use client";

import { useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { setTwoFactorRequiredAction, type SettingsActionResult } from "../actions";

const CONFIRM_ON_MISSING =
  "Você ainda não ativou a verificação em duas etapas. Ao exigir, você vai agora para a tela Segurança e só volta à agenda depois de ativar, e quem também não ativou passa pelo mesmo. Exigir assim mesmo?";
const CONFIRM_ON = "Quem ainda não ativou a verificação em duas etapas vai para a tela Segurança em toda página, até ativar. Exigir?";
const CONFIRM_OFF = "Deixar de exigir a verificação em duas etapas nesta conta? Quem já ativou continua com ela, até desativar na tela Segurança.";

/** Switches the practice's requirement (D-36, D-71). The warning stays on the screen; the confirmation repeats what matters. */
export function TwoFactorRequirementForm({ practiceId, required, currentUserMissing }: { practiceId: string; required: boolean; currentUserMissing: boolean }) {
  const [result, setResult] = useState<SettingsActionResult>({});
  const [pending, startTransition] = useTransition();
  const question = required ? CONFIRM_OFF : currentUserMissing ? CONFIRM_ON_MISSING : CONFIRM_ON;

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={required ? "outline" : "default"}
        disabled={pending}
        className="self-start"
        onClick={() => {
          if (window.confirm(question)) startTransition(async () => setResult(await setTwoFactorRequiredAction(practiceId, !required)));
        }}
      >
        {required ? "Deixar de exigir" : "Exigir verificação em duas etapas"}
      </Button>
      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
