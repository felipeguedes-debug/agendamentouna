"use server";

import { refresh } from "next/cache";
import { revokeRememberedDevice } from "@/lib/auth/devices";
import { requireUser } from "@/lib/auth/guard";

/** Ends one of the caller's own remembered sessions (D-77). */
export async function revokeDeviceAction(sessionId: string) {
  const user = await requireUser({ allowMissingTwoFactor: true });
  await revokeRememberedDevice(user.id, sessionId);
  refresh();
}
