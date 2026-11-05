import { describe, expect, it } from "vitest";
import { daySlots } from "./slots";

// The day beside the booking form (D-82): what is taken, and the free hours within the
// working hours, which a click turns into the appointment's time.

const hours = [{ startTime: "08:00", endTime: "12:00" }];

function appointment(time: string, endTime: string, status = "SCHEDULED") {
  return { kind: "appointment" as const, id: time, time, endTime, status };
}

function times(slots: ReturnType<typeof daySlots>) {
  return slots.map((slot) => (slot.kind === "free" ? `livre ${slot.time}` : slot.item.time));
}

describe("daySlots", () => {
  it("offers each free hour within the working hours, in order with what is taken", () => {
    expect(times(daySlots(hours, [appointment("09:00", "09:30")]))).toEqual(["livre 08:00", "09:00", "livre 10:00", "livre 11:00"]);
  });

  it("does not offer an hour that a longer appointment reaches, or one that a block covers", () => {
    const block = { kind: "block" as const, id: "b", time: "10:00", endTime: "11:00" };
    expect(times(daySlots(hours, [appointment("08:30", "09:30"), block]))).toEqual(["08:30", "10:00", "livre 11:00"]);
  });

  it("frees the time of a canceled appointment and still shows it", () => {
    expect(times(daySlots(hours, [appointment("09:00", "09:30", "CANCELED_BY_PATIENT")]))).toEqual(["livre 08:00", "09:00", "livre 09:00", "livre 10:00", "livre 11:00"]);
  });

  it("covers every interval of the day", () => {
    const day = [{ startTime: "08:00", endTime: "10:00" }, { startTime: "14:00", endTime: "15:00" }];
    expect(times(daySlots(day, []))).toEqual(["livre 08:00", "livre 09:00", "livre 14:00"]);
  });

  it("offers nothing without working hours, because the system does not know the day", () => {
    expect(times(daySlots([], [appointment("09:00", "09:30")]))).toEqual(["09:00"]);
    expect(daySlots([], [])).toEqual([]);
  });

  it("starts at the next whole hour of an interval that starts in the middle of one", () => {
    expect(times(daySlots([{ startTime: "08:30", endTime: "10:00" }], []))).toEqual(["livre 09:00"]);
  });
});
