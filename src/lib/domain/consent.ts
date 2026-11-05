import type { ConsentChannel } from "@/generated/prisma/enums";

/**
 * Contact consent states and channels (D-47), shared by the services and the
 * screens. The log itself lives in src/lib/patients/consent.ts.
 */

/** How the office collects consent; IMPORT is set by the spreadsheet import only. */
export const MANUAL_CONSENT_CHANNELS = ["IN_PERSON", "PHONE", "WHATSAPP", "FORM"] as const satisfies readonly ConsentChannel[];

export type ManualConsentChannel = (typeof MANUAL_CONSENT_CHANNELS)[number];

/** granted: aceita; refused: recusou ou revogou; unknown: nunca perguntado. */
export type ConsentState = "granted" | "refused" | "unknown";

export function consentStateOf(latest: { granted: boolean } | null | undefined): ConsentState {
  if (!latest) return "unknown";
  return latest.granted ? "granted" : "refused";
}

export function isManualConsentChannel(channel: string): channel is ManualConsentChannel {
  return (MANUAL_CONSENT_CHANNELS as readonly string[]).includes(channel);
}
