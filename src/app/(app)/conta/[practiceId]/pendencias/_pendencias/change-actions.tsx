"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resolveGoogleChangeAction, type GoogleActionResult } from "../actions";

/**
 * Accept or revert a change made in Google (PRD 5, rule 3). A move over another
 * appointment comes back with the conflicts; the manager may then accept as an
 * overbooking (D-43).
 */
export function GoogleChangeActions({ practiceId, changeId, canOverbook }: { practiceId: string; changeId: string; canOverbook: boolean }) {
  const [result, setResult] = useState<GoogleActionResult>({});
  const [pending, startTransition] = useTransition();
  const run = (decision: "accept" | "revert", allowConflict = false) =>
    startTransition(async () => setResult(await resolveGoogleChangeAction(practiceId, { changeId, decision, allowConflict })));
  const conflict = (result.details?.length ?? 0) > 0;

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button type="button" size="sm" disabled={pending} onClick={() => run("accept")}>
        Aceitar
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run("revert")}>
        Reverter
      </Button>
      {conflict && canOverbook ? (
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run("accept", true)}>
          Aceitar como encaixe
        </Button>
      ) : null}
      {result.error ? (
        <span role="alert" className="w-full text-right text-xs text-destructive">
          {result.error}
          {result.details?.map((detail) => (
            <span key={detail} className="block">
              {detail}
            </span>
          ))}
        </span>
      ) : null}
    </div>
  );
}
