import { isProduction, requiresRealProviders } from "@/lib/env";
import type { PushProvider } from "./provider";
import { SandboxPushProvider } from "./sandbox";
import { WebPushProvider } from "./web-push";

export type { PushMessage, PushProvider, PushTarget } from "./provider";

/**
 * Picks who delivers the notices from PUSH_PROVIDER (D-78): "webpush" for real, "sandbox"
 * (the default outside production) records them in SandboxPushMessage. Production always
 * delivers, except the production build of the end-to-end flows, which runs on the test
 * database (D-46). Outside production, a Vercel preview included (D-95), the real delivery reaches only the users in
 * PUSH_ALLOWED_USERS, so a test never buzzes a professional's phone.
 */

export function pushMode(): "webpush" | "sandbox" {
  if (requiresRealProviders()) return "webpush";
  return process.env.PUSH_PROVIDER === "webpush" ? "webpush" : "sandbox";
}

/** Emails the real delivery may reach outside production; undefined: no limit (production and sandbox). */
export function allowedPushUsers() {
  if (isProduction() || pushMode() === "sandbox") return undefined;
  return (process.env.PUSH_ALLOWED_USERS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

/** The public VAPID key the browser subscribes with; null hides the notices from the screen. */
export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

export function pushProvider(): PushProvider {
  if (pushMode() === "sandbox") return new SandboxPushProvider();
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) throw new Error("VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT are required to send Web Push");
  return new WebPushProvider({ publicKey, privateKey, subject });
}
