import type { AppointmentStatus } from "@/generated/prisma/enums";
import { PREDICTED_STATUSES } from "@/lib/appointments/status";

/** What the professional's day screen decides from the appointments alone (PRD 11). */

export type DayAppointment = { id: string; status: AppointmentStatus; startsAt: Date; endsAt: Date };

/** Past the point of confirming: whoever arrived or was attended counts as confirmed. */
const CONFIRMED_OR_LATER: readonly AppointmentStatus[] = ["CONFIRMED", "ARRIVED", "IN_PROGRESS", "COMPLETED"];

/**
 * Who stands out on the screen: who is being attended, then who arrived, whatever the
 * clock says; else the first one still ahead. One whose time passed with nobody closing
 * it stays on the list, to be closed, and out of the way.
 */
export function nextAppointment<T extends DayAppointment>(appointments: readonly T[], now: Date): T | undefined {
  const inOrder = [...appointments].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return (
    inOrder.find((item) => item.status === "IN_PROGRESS") ??
    inOrder.find((item) => item.status === "ARRIVED") ??
    inOrder.find((item) => (item.status === "SCHEDULED" || item.status === "CONFIRMED") && item.endsAt > now)
  );
}

export function dayCounts(appointments: readonly DayAppointment[]) {
  return {
    total: appointments.filter((item) => (PREDICTED_STATUSES as readonly AppointmentStatus[]).includes(item.status)).length,
    confirmed: appointments.filter((item) => CONFIRMED_OR_LATER.includes(item.status)).length,
  };
}
