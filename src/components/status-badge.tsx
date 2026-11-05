import { Check, CheckCheck, Circle, CircleDot, MapPin, RotateCcw, UserX, X, type LucideIcon } from "lucide-react";
import type { AppointmentStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";

/** Text colors of each status on the agenda, as in the mockups. */
export const STATUS_TEXT: Record<AppointmentStatus, string> = {
  SCHEDULED: "text-[#5B6663]",
  CONFIRMED: "text-[#0F766E]",
  ARRIVED: "text-[#3B5BDB]",
  IN_PROGRESS: "text-[#7C3AED]",
  COMPLETED: "text-[#15803D]",
  NO_SHOW: "text-[#B45309]",
  CANCELED_BY_PATIENT: "text-[#B91C1C]",
  CANCELED_BY_PRACTICE: "text-[#B91C1C]",
  RESCHEDULED: "text-[#5B6663]",
};

const BADGE: Record<AppointmentStatus, string> = {
  SCHEDULED: "bg-[#EEF1F0] text-[#3A4542]",
  CONFIRMED: "bg-[#E6F4F1] text-[#0F766E]",
  ARRIVED: "bg-[#EEF2FB] text-[#3B5BDB]",
  IN_PROGRESS: "bg-[#F3EEFB] text-[#7C3AED]",
  COMPLETED: "bg-[#DCFCE7] text-[#15803D]",
  NO_SHOW: "bg-[#FEF3E2] text-[#B45309]",
  CANCELED_BY_PATIENT: "bg-[#FDECEC] text-[#B91C1C]",
  CANCELED_BY_PRACTICE: "bg-[#FDECEC] text-[#B91C1C]",
  RESCHEDULED: "bg-[#EEF1F0] text-[#5B6663]",
};

const ICONS: Record<AppointmentStatus, LucideIcon> = {
  SCHEDULED: Circle,
  CONFIRMED: Check,
  ARRIVED: MapPin,
  IN_PROGRESS: CircleDot,
  COMPLETED: CheckCheck,
  NO_SHOW: UserX,
  CANCELED_BY_PATIENT: X,
  CANCELED_BY_PRACTICE: X,
  RESCHEDULED: RotateCcw,
};

/** The status on an agenda card: an icon with its name for tooltips and screen readers (D-82). */
export function StatusIcon({ status, noConfirmation = false }: { status: AppointmentStatus; noConfirmation?: boolean }) {
  const Icon = ICONS[status];
  const label = statusLabel(status, noConfirmation);
  return (
    <span data-testid="status-icon" role="img" aria-label={label} title={label} className={cn("inline-flex shrink-0", noConfirmation ? "text-[#B45309]" : STATUS_TEXT[status])}>
      <Icon aria-hidden className="size-3.5" strokeWidth={2.4} />
    </span>
  );
}

/** "Sem confirmação" replaces Agendado when the cadence got no answer (PRD 6). */
export function statusLabel(status: AppointmentStatus, noConfirmation = false) {
  return noConfirmation ? "Sem confirmação" : STATUS_LABELS[status];
}

export function StatusBadge({ status, noConfirmation = false, className }: { status: AppointmentStatus; noConfirmation?: boolean; className?: string }) {
  return (
    <span
      data-testid="status"
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        noConfirmation ? "bg-[#FEF3E2] text-[#B45309]" : BADGE[status],
        className,
      )}
    >
      {statusLabel(status, noConfirmation)}
    </span>
  );
}

export function isCanceled(status: AppointmentStatus) {
  return status === "CANCELED_BY_PATIENT" || status === "CANCELED_BY_PRACTICE";
}
