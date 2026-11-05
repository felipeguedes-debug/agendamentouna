"use client";

import { useRouter } from "next/navigation";
import { createContext, use, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

const CHECK_MS = 60_000;
const CHECK_TIMEOUT_MS = 8_000;
/** Reopening the app after this long, the old agenda waits behind a notice until the new one comes. */
const STALE_MS = 150_000;

type Gate = "fresh" | "stale" | "offline";

const GateContext = createContext<Gate>("fresh");

/**
 * Keeps the day's agenda current, or off the screen (PRD 7, D-76). Nothing is stored, but
 * the app stays in memory, with the agenda it last received, sometimes since yesterday.
 * While the screen is visible it asks the server every minute and on every return: with
 * an answer the agenda is refreshed; with none, the agenda leaves the screen. The check
 * does not renew the session (D-37): only using the app does.
 */
export function ConnectionProvider({ renderedAt, children }: { renderedAt: number; children: ReactNode }) {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("fresh");
  const [, startTransition] = useTransition();
  const lastFresh = useRef(0);

  // Each new agenda from the server, by this device's clock: a phone's clock may be off.
  useEffect(() => {
    lastFresh.current = Date.now();
  }, [renderedAt]);

  useEffect(() => {
    let running = false;

    async function check() {
      if (document.visibilityState !== "visible" || running) return;
      running = true;
      if (Date.now() - lastFresh.current > STALE_MS) setGate((current) => (current === "offline" ? current : "stale"));
      try {
        const response = await fetch("/api/auth/get-session?disableRefresh=true", { cache: "no-store", signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
        if (!response.ok) throw new Error(`Status ${response.status}`);
        if ((await response.json()) === null) {
          // Signed out on another device, or the session ended.
          window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname)}`);
          return;
        }
        lastFresh.current = Date.now();
        // Together, so the notice leaves only when the new agenda arrives.
        startTransition(() => {
          router.refresh();
          setGate("fresh");
        });
      } catch {
        setGate("offline");
      } finally {
        running = false;
      }
    }

    const goOffline = () => setGate("offline");
    window.addEventListener("online", check);
    window.addEventListener("offline", goOffline);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, CHECK_MS);
    return () => {
      window.removeEventListener("online", check);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [router]);

  return <GateContext value={gate}>{children}</GateContext>;
}

/** What comes from the agenda and has no room for the notice: it is simply not shown. */
export function WhenCurrent({ children }: { children: ReactNode }) {
  return use(GateContext) === "fresh" ? children : null;
}

/** The agenda itself, or the notice in its place. */
export function ConnectionGate({ children }: { children: ReactNode }) {
  const gate = use(GateContext);
  if (gate === "fresh") return children;
  return (
    <div role="status" data-testid="connection-notice" className="flex flex-col gap-2 rounded-xl border border-[#E3E8E6] bg-white p-5 text-center">
      {gate === "offline" ? (
        <>
          <h2 className="text-base font-semibold">Sem conexão</h2>
          <p className="text-sm text-[#3A4542]">A agenda só aparece com internet, para não mostrar horários desatualizados como se fossem de agora. Assim que a conexão voltar, ela aparece aqui.</p>
        </>
      ) : (
        <h2 className="text-base font-semibold">Atualizando a agenda…</h2>
      )}
    </div>
  );
}
