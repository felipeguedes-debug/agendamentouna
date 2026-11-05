import { describe, expect, it } from "vitest";
import type { GoogleEvent } from "./provider";
import { blockFromEvent, busyCalendarIds, eventIdFor, eventTitle, keepsEvent, sameTimes, syncWindow } from "./rules";

// The pure rules of the Google sync (PRD 5; D-14, D-15): what the event in the
// secondary calendar says, which calendars count as busy, and which Google events
// become a "Compromisso Google" block.

const FORTALEZA = "America/Fortaleza";

function event(overrides: Partial<GoogleEvent> = {}): GoogleEvent {
  return {
    id: "evt1",
    status: "confirmed",
    updated: new Date("2026-11-01T12:00:00Z"),
    start: { dateTime: new Date("2026-11-03T13:00:00Z") },
    end: { dateTime: new Date("2026-11-03T14:00:00Z") },
    transparency: "opaque",
    eventType: "default",
    declinedBySelf: false,
    appointmentId: null,
    ...overrides,
  };
}

describe("event of an appointment (D-14, D-62)", () => {
  it("carries the first name, the type's display name and the status", () => {
    expect(eventTitle({ patientName: "Carlos Lima de Souza", anonymized: false, typeLabel: "Procedimento", status: "SCHEDULED" })).toBe(
      "Carlos · Procedimento (Agendado)",
    );
    expect(eventTitle({ patientName: "Ana", anonymized: false, typeLabel: "Consulta", status: "CONFIRMED" })).toBe("Ana · Consulta (Confirmado)");
    expect(eventTitle({ patientName: "  Bia  Rocha ", anonymized: false, typeLabel: "Exame", status: "COMPLETED" })).toBe("Bia · Exame (Atendido)");
  });

  it("leaves the name out once the patient is erased (D-28)", () => {
    expect(eventTitle({ patientName: "Paciente excluído", anonymized: true, typeLabel: "Consulta", status: "COMPLETED" })).toBe("Consulta (Atendido)");
  });

  it("keeps the event while the appointment holds the time or was closed, not when canceled or rescheduled", () => {
    for (const status of ["SCHEDULED", "CONFIRMED", "ARRIVED", "IN_PROGRESS", "COMPLETED", "NO_SHOW"] as const) expect(keepsEvent(status)).toBe(true);
    for (const status of ["CANCELED_BY_PATIENT", "CANCELED_BY_PRACTICE", "RESCHEDULED"] as const) expect(keepsEvent(status)).toBe(false);
  });

  it("derives a valid Google event id from the appointment id", () => {
    const id = eventIdFor("5E2E0000-0000-4000-8000-00000000000A");
    expect(id).toBe("5e2e000000004000800000000000000a");
    expect(id).toMatch(/^[0-9a-v]{32}$/);
    expect(eventIdFor("5e2e0000-0000-4000-8000-00000000000a")).toBe(id);
  });
});

describe("calendars that count as busy (PRD 5, rule 1; D-15)", () => {
  const calendars = [
    { googleCalendarId: "primary@example.com", accessRole: "owner" },
    { googleCalendarId: "family@group", accessRole: "writer" },
    { googleCalendarId: "holidays@group", accessRole: "reader" },
    { googleCalendarId: "secondary-this@group", accessRole: "owner" },
    { googleCalendarId: "secondary-other@group", accessRole: "owner" },
  ];

  it("are by default every calendar the professional can write to, except this practice's secondary", () => {
    expect(busyCalendarIds({ calendars, ownSecondaryId: "secondary-this@group", chosen: false, chosenIds: [] })).toEqual([
      "primary@example.com",
      "family@group",
      "secondary-other@group",
    ]);
  });

  it("follow the professional's choice, read-only calendars included, never this practice's secondary", () => {
    expect(
      busyCalendarIds({ calendars, ownSecondaryId: "secondary-this@group", chosen: true, chosenIds: ["holidays@group", "secondary-this@group", "gone@group"] }),
    ).toEqual(["holidays@group"]);
    expect(busyCalendarIds({ calendars, ownSecondaryId: null, chosen: true, chosenIds: [] })).toEqual([]);
  });
});

describe("Google event as a block (D-15)", () => {
  const options = { allDayEventsBlock: true, timeZone: FORTALEZA };

  it("blocks a busy timed event with its own times and nothing of its content", () => {
    expect(blockFromEvent(event(), options)).toEqual({
      startsAt: new Date("2026-11-03T13:00:00Z"),
      endsAt: new Date("2026-11-03T14:00:00Z"),
      allDay: false,
    });
  });

  it("does not block a free timed event", () => {
    expect(blockFromEvent(event({ transparency: "transparent" }), options)).toBeNull();
  });

  it("blocks an all-day event even when Google made it free, unless the professional turned that off", () => {
    const allDay = event({ start: { date: "2026-11-05" }, end: { date: "2026-11-07" }, transparency: "transparent" });
    expect(blockFromEvent(allDay, options)).toEqual({
      startsAt: new Date("2026-11-05T03:00:00Z"),
      endsAt: new Date("2026-11-07T03:00:00Z"),
      allDay: true,
    });
    expect(blockFromEvent(allDay, { ...options, allDayEventsBlock: false })).toBeNull();
    expect(blockFromEvent({ ...allDay, transparency: "opaque" }, { ...options, allDayEventsBlock: false })).not.toBeNull();
  });

  it("reads an all-day event in the agenda's time zone", () => {
    const allDay = event({ start: { date: "2026-11-05" }, end: { date: "2026-11-06" } });
    expect(blockFromEvent(allDay, { allDayEventsBlock: true, timeZone: "America/Manaus" })?.startsAt).toEqual(new Date("2026-11-05T04:00:00Z"));
  });

  it("ignores cancelled events, declined invitations, working locations and birthdays", () => {
    expect(blockFromEvent(event({ status: "cancelled" }), options)).toBeNull();
    expect(blockFromEvent(event({ declinedBySelf: true }), options)).toBeNull();
    expect(blockFromEvent(event({ eventType: "workingLocation", start: { date: "2026-11-05" }, end: { date: "2026-11-06" } }), options)).toBeNull();
    expect(blockFromEvent(event({ eventType: "birthday", start: { date: "2026-11-05" }, end: { date: "2026-11-06" } }), options)).toBeNull();
    expect(blockFromEvent(event({ eventType: "outOfOffice" }), options)).not.toBeNull();
  });

  it("ignores an event without times or ending before it starts", () => {
    expect(blockFromEvent(event({ start: null }), options)).toBeNull();
    expect(blockFromEvent(event({ end: { dateTime: new Date("2026-11-03T12:00:00Z") } }), options)).toBeNull();
  });
});

describe("sync window (D-15, D-61)", () => {
  it("reads 90 days ahead of now", () => {
    const now = new Date("2026-11-01T10:00:00Z");
    expect(syncWindow(now)).toEqual({ timeMin: now, timeMax: new Date("2027-01-30T10:00:00Z") });
  });

  it("compares a timed event with an appointment's times", () => {
    const start = new Date("2026-11-03T13:00:00Z");
    const end = new Date("2026-11-03T14:00:00Z");
    expect(sameTimes(event(), start, end)).toBe(true);
    expect(sameTimes(event({ end: { dateTime: new Date("2026-11-03T14:30:00Z") } }), start, end)).toBe(false);
    expect(sameTimes(event({ start: { date: "2026-11-03" } }), start, end)).toBe(false);
  });
});
