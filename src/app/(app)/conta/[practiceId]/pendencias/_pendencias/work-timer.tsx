"use client";

import { useEffect } from "react";
import { recordConfirmationWorkAction } from "../actions";

const BEAT_MS = 60_000;
const IDLE_MS = 120_000;

/**
 * Measures the time on the "Sem confirmação" list (PRD 8, D-75): a minute for every
 * minute the screen is visible with someone acting on it. A beat that fails is a
 * minute not counted, and never disturbs the list.
 */
export function ConfirmationWorkTimer({ practiceId }: { practiceId: string }) {
  useEffect(() => {
    let lastActivity = Date.now();
    const touched = () => {
      lastActivity = Date.now();
    };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    for (const event of events) window.addEventListener(event, touched, { passive: true });
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() - lastActivity < IDLE_MS) {
        recordConfirmationWorkAction(practiceId).catch(() => undefined);
      }
    }, BEAT_MS);
    return () => {
      window.clearInterval(timer);
      for (const event of events) window.removeEventListener(event, touched);
    };
  }, [practiceId]);
  return null;
}
