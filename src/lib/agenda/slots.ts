/**
 * The day beside the booking form (D-82). Pure, so the client form uses it: what is
 * taken, in order with the free whole hours inside the working hours. Informative, as
 * the working hours are (D-43): the conflict check stays with the booking.
 */

type Hours = { startTime: string; endTime: string };
type Item = { kind: string; time: string; endTime: string; status?: string };

export type DaySlot<T extends Item> = { kind: "item"; item: T; time: string } | { kind: "free"; time: string };

const CANCELED = ["CANCELED_BY_PATIENT", "CANCELED_BY_PRACTICE", "RESCHEDULED"];

function wholeHours(hours: Hours) {
  const result: string[] = [];
  const [startHour, startMinute] = hours.startTime.split(":").map(Number);
  for (let hour = startMinute > 0 ? startHour + 1 : startHour; `${String(hour).padStart(2, "0")}:00` < hours.endTime; hour += 1) {
    result.push(`${String(hour).padStart(2, "0")}:00`);
  }
  return result;
}

function endOfHour(time: string) {
  return `${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`;
}

export function daySlots<T extends Item>(workingHours: readonly Hours[], items: readonly T[]): DaySlot<T>[] {
  const taken = items.filter((item) => !(item.status && CANCELED.includes(item.status)));
  const free = workingHours.flatMap(wholeHours).filter((time) => !taken.some((item) => item.time < endOfHour(time) && item.endTime > time));
  const slots: DaySlot<T>[] = [...items.map((item) => ({ kind: "item" as const, item, time: item.time })), ...free.map((time) => ({ kind: "free" as const, time }))];
  // At the same time, what exists comes before the free hour.
  return slots.sort((first, second) => first.time.localeCompare(second.time) || (first.kind === "item" ? -1 : 1));
}
