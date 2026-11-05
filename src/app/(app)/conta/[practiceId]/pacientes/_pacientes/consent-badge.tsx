import type { ConsentState } from "@/lib/domain/consent";
import { cn } from "@/lib/utils";

export const CONSENT_STATE_LABELS: Record<ConsentState, string> = {
  granted: "Aceita WhatsApp",
  refused: "Não aceita",
  unknown: "Sem registro",
};

const STYLE: Record<ConsentState, string> = {
  granted: "bg-[#E6F4F1] text-[#0F766E]",
  refused: "bg-[#FDECEC] text-[#B91C1C]",
  unknown: "bg-[#EEF1F0] text-[#5B6663]",
};

/** The current contact consent (D-47): only "Aceita WhatsApp" enters the cadence. */
export function ConsentBadge({ state, className }: { state: ConsentState; className?: string }) {
  return (
    <span data-testid="consent" className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", STYLE[state], className)}>
      {CONSENT_STATE_LABELS[state]}
    </span>
  );
}
