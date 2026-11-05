"use client";

import { useState } from "react";
import { unsubscribeBrowser } from "@/components/pwa/device";
import { authClient } from "@/lib/auth/client";

/** The browser's own unsubscribing never holds up leaving: the server already stopped. */
const UNSUBSCRIBE_LIMIT_MS = 3_000;

export const SIGN_OUT_FAILED_TEXT = "Não foi possível sair. Confira a conexão e tente de novo.";

/**
 * Every way out of the app goes through here. False means the session is still alive,
 * and the screen must say so: only the server's answer ends it. Going to the login page
 * without it would look signed out while the session, its 30 days and its notices stay
 * alive (D-79).
 */
export async function signOutAndLeave() {
  try {
    const { error } = await authClient.signOut();
    if (error) throw new Error(`Sign-out answered ${error.status}`);
  } catch {
    return false;
  }
  // The notices ended with the session; the browser hears it too, so the next person on
  // this phone inherits nothing (D-78).
  await Promise.race([unsubscribeBrowser(), new Promise((resolve) => setTimeout(resolve, UNSUBSCRIBE_LIMIT_MS))]);
  // A full load, so no screen stays in the app's memory after leaving (D-76).
  window.location.replace("/login");
  return true;
}

export function SignOutButton({ className, failureClassName }: { className?: string; failureClassName?: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    setPending(true);
    setFailed(false);
    if (!(await signOutAndLeave())) {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <>
      <button type="button" disabled={pending} className={className ?? "text-sm text-zinc-600 hover:text-zinc-900 hover:underline"} onClick={signOut}>
        Sair
      </button>
      {failed ? (
        <span role="alert" className={failureClassName ?? "text-xs text-red-700"}>
          {SIGN_OUT_FAILED_TEXT}
        </span>
      ) : null}
    </>
  );
}
