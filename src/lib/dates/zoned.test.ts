import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  eachDay,
  firstOfMonth,
  formatDateBr,
  formatDayLabel,
  formatLongDate,
  formatMonthTitle,
  formatTime,
  formatWeekRange,
  isIsoDate,
  isTime,
  mondayOf,
  startOfZonedDay,
  todayIn,
  toZoned,
  weekdayOf,
  zonedToUtc,
} from "./zoned";

// Dates live in UTC; the wall clock is always the location's time zone (D-03).

describe("zonedToUtc", () => {
  it("reads a Fortaleza wall-clock time (UTC-3, no daylight saving)", () => {
    expect(zonedToUtc("2026-10-21", "08:00", "America/Fortaleza").toISOString()).toBe("2026-10-21T11:00:00.000Z");
  });

  it("reads a Manaus wall-clock time (UTC-4)", () => {
    expect(zonedToUtc("2026-10-21", "08:00", "America/Manaus").toISOString()).toBe("2026-10-21T12:00:00.000Z");
  });

  it("follows daylight saving where the zone has it", () => {
    expect(zonedToUtc("2026-07-01", "09:30", "America/New_York").toISOString()).toBe("2026-07-01T13:30:00.000Z");
    expect(zonedToUtc("2026-12-01", "09:30", "America/New_York").toISOString()).toBe("2026-12-01T14:30:00.000Z");
  });

  it("crosses the date line when needed", () => {
    expect(zonedToUtc("2026-10-21", "22:30", "America/Fortaleza").toISOString()).toBe("2026-10-22T01:30:00.000Z");
  });
});

describe("toZoned", () => {
  it("returns the wall-clock date, time and weekday of an instant", () => {
    expect(toZoned(new Date("2026-10-22T01:30:00Z"), "America/Fortaleza")).toEqual({
      date: "2026-10-21",
      time: "22:30",
      hour: 22,
      minute: 30,
      weekday: 3,
    });
  });

  it("round-trips with zonedToUtc", () => {
    const instant = zonedToUtc("2026-03-08", "03:15", "America/New_York");
    expect(toZoned(instant, "America/New_York")).toMatchObject({ date: "2026-03-08", time: "03:15" });
  });
});

describe("calendar arithmetic on ISO dates", () => {
  it("validates dates and times", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("21/10/2026")).toBe(false);
    expect(isTime("08:00")).toBe(true);
    expect(isTime("23:59")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("8:00")).toBe(false);
  });

  it("adds days and months across boundaries", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(firstOfMonth("2026-10-21")).toBe("2026-10-01");
  });

  it("knows weekdays and the Monday of a week", () => {
    expect(weekdayOf("2026-10-21")).toBe(3);
    expect(mondayOf("2026-10-21")).toBe("2026-10-19");
    expect(mondayOf("2026-10-25")).toBe("2026-10-19");
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
  });

  it("lists the days of a period", () => {
    expect(eachDay("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
  });

  it("starts the day at local midnight", () => {
    expect(startOfZonedDay("2026-10-21", "America/Fortaleza").toISOString()).toBe("2026-10-21T03:00:00.000Z");
  });

  it("tells today's date in a time zone", () => {
    const now = new Date("2026-10-22T02:00:00Z");
    expect(todayIn("America/Fortaleza", now)).toBe("2026-10-21");
    expect(todayIn("UTC", now)).toBe("2026-10-22");
  });
});

describe("pt-BR formatting", () => {
  it("formats times in the location's zone", () => {
    expect(formatTime(new Date("2026-10-21T11:00:00Z"), "America/Fortaleza")).toBe("08:00");
  });

  it("formats dates for the agenda", () => {
    expect(formatDateBr("2026-10-21")).toBe("21/10/2026");
    expect(formatDayLabel("2026-10-21")).toBe("Qua 21");
    expect(formatLongDate("2026-10-21")).toBe("quarta-feira, 21 de outubro de 2026");
    expect(formatMonthTitle("2026-10-21")).toBe("outubro de 2026");
  });

  it("formats a week range like the mockup", () => {
    expect(formatWeekRange("2026-10-19", "2026-10-23")).toBe("19 a 23 de outubro de 2026");
    expect(formatWeekRange("2026-10-26", "2026-11-01")).toBe("26 de outubro a 1 de novembro de 2026");
    expect(formatWeekRange("2026-12-28", "2027-01-03")).toBe("28 de dezembro de 2026 a 3 de janeiro de 2027");
  });
});
