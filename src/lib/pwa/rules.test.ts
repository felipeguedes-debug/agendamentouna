import { describe, expect, it } from "vitest";
import { dayCounts, nextAppointment, type DayAppointment } from "./rules";

// PRD 11, "PWA do profissional": the next appointment stands out, with the day's counts.

const NOW = new Date("2026-10-21T10:00:00-03:00");

function appointment(id: string, start: string, end: string, status: DayAppointment["status"] = "CONFIRMED"): DayAppointment {
  return { id, status, startsAt: new Date(`2026-10-21T${start}:00-03:00`), endsAt: new Date(`2026-10-21T${end}:00-03:00`) };
}

describe("nextAppointment", () => {
  it("is the first one that has not ended", () => {
    const items = [appointment("a", "08:00", "08:30", "COMPLETED"), appointment("b", "11:00", "11:30"), appointment("c", "14:00", "14:30")];
    expect(nextAppointment(items, NOW)?.id).toBe("b");
  });

  it("counts one still going", () => {
    expect(nextAppointment([appointment("a", "09:45", "10:15")], NOW)?.id).toBe("a");
  });

  it("does not pick one whose time passed with nobody closing it", () => {
    const items = [appointment("a", "08:00", "08:30"), appointment("b", "11:00", "11:30")];
    expect(nextAppointment(items, NOW)?.id).toBe("b");
  });

  it("skips canceled, rescheduled and closed ones", () => {
    const items = [
      appointment("a", "11:00", "11:30", "CANCELED_BY_PATIENT"),
      appointment("b", "11:30", "12:00", "CANCELED_BY_PRACTICE"),
      appointment("c", "12:00", "12:30", "RESCHEDULED"),
      appointment("d", "13:00", "13:30", "NO_SHOW"),
      appointment("e", "14:00", "14:30", "COMPLETED"),
      appointment("f", "15:00", "15:30", "SCHEDULED"),
    ];
    expect(nextAppointment(items, NOW)?.id).toBe("f");
  });

  it("prefers who is being attended, then who arrived, even past the expected end", () => {
    const items = [appointment("late", "08:00", "08:30", "IN_PROGRESS"), appointment("waiting", "09:00", "09:30", "ARRIVED"), appointment("later", "11:00", "11:30")];
    expect(nextAppointment(items, NOW)?.id).toBe("late");
    expect(nextAppointment(items.slice(1), NOW)?.id).toBe("waiting");
  });

  it("is nothing when the day is done", () => {
    expect(nextAppointment([appointment("a", "08:00", "08:30", "COMPLETED")], NOW)).toBeUndefined();
    expect(nextAppointment([], NOW)).toBeUndefined();
  });
});

describe("dayCounts", () => {
  it("counts the day without canceled and rescheduled, and who is confirmed or further along", () => {
    const counts = dayCounts([
      appointment("a", "08:00", "08:30", "COMPLETED"),
      appointment("b", "09:00", "09:30", "IN_PROGRESS"),
      appointment("c", "10:00", "10:30", "ARRIVED"),
      appointment("d", "11:00", "11:30", "CONFIRMED"),
      appointment("e", "12:00", "12:30", "SCHEDULED"),
      appointment("f", "13:00", "13:30", "NO_SHOW"),
      appointment("g", "14:00", "14:30", "CANCELED_BY_PATIENT"),
      appointment("h", "15:00", "15:30", "RESCHEDULED"),
    ]);
    expect(counts).toEqual({ total: 6, confirmed: 4 });
  });
});
