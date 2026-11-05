"use client";

import { useEffect } from "react";

/** Registers public/sw.js from the PWA's screens (D-76). Without it the app still works online. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error: unknown) => {
      console.warn("Service worker not registered", error);
    });
  }, []);
  return null;
}
