"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { authClient, rememberThisDevice } from "@/lib/auth/client";
import { REMEMBERED_RENEW_BELOW_SECONDS } from "@/lib/auth/session-lengths";

const MIN_INTERVAL_MS = 5 * 60 * 1000;
let lastRenewal = 0;

/**
 * Renews the 12 h web session as the user moves around (D-17, D-37). Server
 * Components cannot set cookies, so the renewal goes through /api/auth/get-session,
 * which extends the session and its cookie together. A tab left idle never calls
 * it, so the session ends 12 h after the last navigation. A remembered device of the
 * PWA gets its 30 days back the same way, at most once a day (D-77).
 */
export function SessionKeepAlive() {
  const pathname = usePathname();
  useEffect(() => {
    if (Date.now() - lastRenewal < MIN_INTERVAL_MS) return;
    lastRenewal = Date.now();
    void authClient.getSession().then(({ data }) => {
      if (!data?.session.rememberedDevice) return;
      const secondsLeft = (new Date(data.session.expiresAt).getTime() - Date.now()) / 1000;
      if (secondsLeft < REMEMBERED_RENEW_BELOW_SECONDS) void rememberThisDevice();
    });
  }, [pathname]);
  return null;
}
