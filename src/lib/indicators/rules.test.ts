import { describe, expect, it } from "vitest";
import {
  adoptionRate,
  confirmationRate,
  confirmationWork,
  deliveryRate,
  googleCoverage,
  lastCompleteWeek,
  noShowByType,
  noShowRate,
  occupancy,
  parseIndicatorPeriod,
  ratio,
  syncFailureRate,
  targetStatus,
  usageDays,
  valueRealization,
  type AppointmentFact,
} from "./rules";

// PRD 8, D-13, D-74 and D-75. Every expected number here was worked out by hand from
// the rows in the test; none comes from the code under test.

function fact(overrides: Partial<AppointmentFact> = {}): AppointmentFact {
  return { status: "COMPLETED", dayOver: true, typeId: "t1", typeName: "Consulta", priceCents: 10000, ...overrides };
}

describe("ratio", () => {
  it("has no value when nothing was measured, never a zero", () => {
    expect(ratio(0, 0).value).toBeNull();
    expect(ratio(0, 4).value).toBe(0);
    expect(ratio(1, 4).value).toBe(0.25);
  });
});

describe("taxa de falta (D-13)", () => {
  it("is Faltou ÷ (Atendido + Faltou), with Sem baixa left out and shown apart", () => {
    const result = noShowRate([
      fact(),
      fact(),
      fact(),
      fact({ status: "NO_SHOW" }),
      // Sem baixa: the day is over and nobody closed them.
      fact({ status: "SCHEDULED" }),
      fact({ status: "CONFIRMED" }),
      fact({ status: "ARRIVED" }),
      fact({ status: "IN_PROGRESS" }),
    ]);
    expect(result).toMatchObject({ completed: 3, noShow: 1, withoutClosing: 4 });
    expect(result.rate.value).toBe(0.25);
  });

  it("does not count as Sem baixa what happens later today", () => {
    expect(noShowRate([fact({ status: "CONFIRMED", dayOver: false })]).withoutClosing).toBe(0);
  });

  it("leaves canceled and rescheduled out of everything", () => {
    const result = noShowRate([fact({ status: "CANCELED_BY_PATIENT" }), fact({ status: "CANCELED_BY_PRACTICE" }), fact({ status: "RESCHEDULED" })]);
    expect(result).toMatchObject({ completed: 0, noShow: 0, withoutClosing: 0 });
    expect(result.rate.value).toBeNull();
  });

  it("breaks down by type, most no-shows first, with the Sem baixa of each", () => {
    const rows = noShowByType([
      fact({ typeId: "a", typeName: "Retorno" }),
      fact({ typeId: "b", typeName: "Doppler", status: "NO_SHOW" }),
      fact({ typeId: "b", typeName: "Doppler" }),
      fact({ typeId: "b", typeName: "Doppler", status: "CONFIRMED" }),
      fact({ typeId: "c", typeName: "Só cancelados", status: "CANCELED_BY_PATIENT" }),
    ]);
    expect(rows.map((row) => [row.typeName, row.completed, row.noShow, row.withoutClosing, row.rate.value])).toEqual([
      ["Doppler", 1, 1, 1, 0.5],
      ["Retorno", 1, 0, 0, 0],
    ]);
  });
});

describe("valor previsto vs realizado (D-13)", () => {
  it("uses the definitions of the agenda panel and tells how much is Sem baixa", () => {
    const result = valueRealization([
      fact({ priceCents: 45000 }),
      fact({ status: "NO_SHOW", priceCents: 80000 }),
      fact({ status: "CONFIRMED", priceCents: 35000 }),
      fact({ status: "SCHEDULED", dayOver: false, priceCents: 20000 }),
      fact({ status: "CANCELED_BY_PATIENT", priceCents: 99900 }),
      fact({ status: "RESCHEDULED", priceCents: 99900 }),
    ]);
    // Previsto: 450 + 800 + 350 + 200 = 1.800. Realizado: 450. 450 / 1800 = 0,25.
    expect(result).toMatchObject({ predictedCents: 180000, realizedCents: 45000, withoutClosingCents: 35000 });
    expect(result.rate.value).toBe(0.25);
  });
});

describe("taxa de confirmação automática", () => {
  const request = (status: "SENT" | "DELIVERED" | "READ" | "FAILED" | "CANCELED" | "SKIPPED" | "SCHEDULED", sent = status !== "CANCELED" && status !== "SKIPPED" && status !== "SCHEDULED") => ({ status, sent });

  it("divides the confirmed by a WhatsApp reply by the appointments the cadence could ask", () => {
    const result = confirmationRate([
      { status: "COMPLETED", confirmedByReply: true, requests: [request("READ")] },
      { status: "CONFIRMED", confirmedByReply: true, requests: [request("READ")] },
      // Asked, no answer.
      { status: "NO_SHOW", confirmedByReply: false, requests: [request("DELIVERED")] },
      // Asked and the patient canceled: the cadence had its chance.
      { status: "CANCELED_BY_PATIENT", confirmedByReply: false, requests: [request("READ")] },
      // The secretary confirmed first: the request was canceled and it still counts.
      { status: "CONFIRMED", confirmedByReply: false, requests: [request("CANCELED")] },
      // The send failed: the system's fault, it stays in.
      { status: "COMPLETED", confirmedByReply: false, requests: [request("FAILED", false)] },
    ]);
    expect(result).toMatchObject({ numerator: 2, denominator: 6 });
  });

  it("leaves out who was never in the cadence, rescheduled, canceled before being asked and requests skipped at planning", () => {
    const result = confirmationRate([
      { status: "COMPLETED", confirmedByReply: false, requests: [] },
      { status: "RESCHEDULED", confirmedByReply: false, requests: [request("READ")] },
      { status: "CANCELED_BY_PRACTICE", confirmedByReply: false, requests: [request("CANCELED")] },
      { status: "COMPLETED", confirmedByReply: false, requests: [request("SKIPPED")] },
    ]);
    expect(result.denominator).toBe(0);
    expect(result.value).toBeNull();
  });

  it("never has a numerator outside the denominator", () => {
    const result = confirmationRate([{ status: "COMPLETED", confirmedByReply: true, requests: [] }]);
    expect(result).toMatchObject({ numerator: 1, denominator: 1, value: 1 });
  });
});

describe("entrega de WhatsApp", () => {
  it("is delivered ÷ sent; read counts as delivered, and a message that never left only shows apart", () => {
    const result = deliveryRate([
      { status: "DELIVERED", sent: true },
      { status: "READ", sent: true },
      { status: "READ", sent: true },
      { status: "SENT", sent: true },
      { status: "FAILED", sent: false },
      { status: "FAILED", sent: true },
    ]);
    expect(result.rate).toMatchObject({ numerator: 3, denominator: 5 });
    expect(result.neverSent).toBe(1);
  });
});

describe("cobertura de Google Agenda", () => {
  it("counts only the active links over the registered professionals", () => {
    expect(googleCoverage(["active", "active", "revoked", "error", "none"])).toMatchObject({ numerator: 2, denominator: 5, value: 0.4 });
    expect(googleCoverage([]).value).toBeNull();
  });
});

describe("falhas de sincronização", () => {
  it("divides the events with an error by the events the export reached", () => {
    const synced = new Date("2026-10-20T12:00:00Z");
    const result = syncFailureRate([
      { syncedAt: synced, error: null },
      { syncedAt: synced, error: null },
      { syncedAt: synced, error: "server" },
      { syncedAt: null, error: "rate_limit" },
      // Never reached the export: no secondary calendar.
      { syncedAt: null, error: null },
    ]);
    expect(result).toMatchObject({ numerator: 2, denominator: 4, value: 0.5 });
  });

  it("has no value when nothing was exported", () => {
    expect(syncFailureRate([{ syncedAt: null, error: null }]).value).toBeNull();
  });
});

describe("ocupação", () => {
  const FORTALEZA = "America/Fortaleza";
  // 2026-10-19 is a Monday; 2026-10-20 a Tuesday.
  const period = { start: "2026-10-19", endExclusive: "2026-10-21" };
  const utc = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);

  it("is the occupied minutes over the working hours left after blocks and exceptions", () => {
    const result = occupancy({
      period,
      workingHours: [
        { weekday: 1, startTime: "08:00", endTime: "12:00", timeZone: FORTALEZA, locationId: "a" }, // Monday: 240 min
        { weekday: 2, startTime: "08:00", endTime: "10:00", timeZone: FORTALEZA, locationId: "a" }, // Tuesday: 120 min
        { weekday: 3, startTime: "08:00", endTime: "12:00", timeZone: FORTALEZA, locationId: "a" }, // Outside the period
      ],
      exceptions: [],
      blocks: [{ startsAt: utc("2026-10-19", "08:00"), endsAt: utc("2026-10-19", "09:00") }], // 60 min less: 300 available
      appointments: [
        { startsAt: utc("2026-10-19", "09:00"), endsAt: utc("2026-10-19", "09:30") }, // 30
        { startsAt: utc("2026-10-20", "08:00"), endsAt: utc("2026-10-20", "09:00") }, // 60
      ],
    });
    expect(result).toMatchObject({ occupiedMinutes: 90, availableMinutes: 300, rate: { value: 0.3 } });
  });

  it("clips what falls outside the available hours, so it never passes 100%", () => {
    const result = occupancy({
      period,
      workingHours: [{ weekday: 1, startTime: "08:00", endTime: "09:00", timeZone: FORTALEZA, locationId: "a" }],
      exceptions: [],
      blocks: [],
      appointments: [
        { startsAt: utc("2026-10-19", "07:30"), endsAt: utc("2026-10-19", "08:30") }, // 30 inside
        { startsAt: utc("2026-10-19", "08:15"), endsAt: utc("2026-10-19", "08:45") }, // overlaps the first: 15 more
        { startsAt: utc("2026-10-19", "14:00"), endsAt: utc("2026-10-19", "15:00") }, // outside
      ],
    });
    expect(result).toMatchObject({ occupiedMinutes: 45, availableMinutes: 60 });
  });

  it("removes the day of an exception, for one location or for all of them", () => {
    const result = occupancy({
      period,
      workingHours: [
        { weekday: 1, startTime: "08:00", endTime: "10:00", timeZone: FORTALEZA, locationId: "a" },
        { weekday: 1, startTime: "14:00", endTime: "16:00", timeZone: FORTALEZA, locationId: "b" },
        { weekday: 2, startTime: "08:00", endTime: "10:00", timeZone: FORTALEZA, locationId: "a" },
      ],
      exceptions: [
        { startsOn: "2026-10-19", endsOn: "2026-10-19", locationId: "a" },
        { startsOn: "2026-10-20", endsOn: "2026-10-20", locationId: null },
      ],
      blocks: [],
      appointments: [],
    });
    // Only location b on Monday is left: 120 min.
    expect(result.availableMinutes).toBe(120);
  });

  it("reads the hours in the location's time zone", () => {
    const result = occupancy({
      period: { start: "2026-10-19", endExclusive: "2026-10-20" },
      workingHours: [{ weekday: 1, startTime: "08:00", endTime: "09:00", timeZone: "America/Manaus", locationId: "a" }],
      exceptions: [],
      blocks: [],
      // 08:00 in Manaus is 09:00 in Fortaleza.
      appointments: [{ startsAt: utc("2026-10-19", "09:00"), endsAt: utc("2026-10-19", "10:00") }],
    });
    expect(result).toMatchObject({ occupiedMinutes: 60, availableMinutes: 60 });
  });

  it("counts two locations at the same hour once: the professional is in one place", () => {
    const result = occupancy({
      period: { start: "2026-10-19", endExclusive: "2026-10-20" },
      workingHours: [
        { weekday: 1, startTime: "08:00", endTime: "10:00", timeZone: FORTALEZA, locationId: "a" },
        { weekday: 1, startTime: "09:00", endTime: "11:00", timeZone: FORTALEZA, locationId: "b" },
      ],
      exceptions: [],
      blocks: [],
      appointments: [],
    });
    expect(result.availableMinutes).toBe(180);
  });

  it("has no value without working hours", () => {
    expect(occupancy({ period, workingHours: [], exceptions: [], blocks: [], appointments: [] }).rate.value).toBeNull();
  });
});

describe("adoção (D-75)", () => {
  // 2026-10-12 is a Monday.
  const week = { start: "2026-10-12", endExclusive: "2026-10-19" };
  const at = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);

  it("takes the last whole week, Monday to Sunday", () => {
    expect(lastCompleteWeek("2026-10-25")).toEqual(week); // Sunday: this week is still going.
    expect(lastCompleteWeek("2026-10-19")).toEqual(week); // Monday of the next one.
  });

  it("counts distinct local working days, Monday to Saturday", () => {
    const days = usageDays(
      [
        at("2026-10-12", "09:00"),
        at("2026-10-12", "15:00"), // the same day
        at("2026-10-14", "09:00"),
        at("2026-10-17", "09:00"), // Saturday counts
        at("2026-10-18", "09:00"), // Sunday does not
        at("2026-10-19", "09:00"), // the next week
        at("2026-10-11", "09:00"), // the week before
      ],
      week,
      "America/Fortaleza",
    );
    expect(days).toBe(3);
  });

  it("reads the day in the practice's time zone", () => {
    // 00:30 of Monday in Fortaleza is still Sunday in Manaus.
    expect(usageDays([at("2026-10-12", "00:30")], week, "America/Fortaleza")).toBe(1);
    expect(usageDays([at("2026-10-12", "00:30")], week, "America/Manaus")).toBe(0);
  });

  it("divides the practices with 5 or more days by the practices in use, leaving out those never used", () => {
    const result = adoptionRate([5, 6, 4, 0, null]);
    expect(result).toMatchObject({ numerator: 2, denominator: 4, value: 0.5 });
    expect(adoptionRate([null, null]).value).toBeNull();
  });
});

describe("tempo da secretária em confirmação (D-75)", () => {
  const row = (date: string, minutes: number) => ({ date, minutes });

  it("has no number before there is a measurement", () => {
    expect(confirmationWork({ inPeriod: [], all: [] })).toEqual({ minutesPerDay: null, measuredDays: 0, baselinePerDay: null, dropRate: null });
  });

  it("adds the users of a day and averages over the measured days", () => {
    const result = confirmationWork({
      inPeriod: [row("2026-10-19", 30), row("2026-10-19", 20), row("2026-10-20", 10)],
      all: [row("2026-10-19", 30), row("2026-10-19", 20), row("2026-10-20", 10)],
    });
    // (30 + 20 + 10) / 2 days = 30.
    expect(result).toMatchObject({ minutesPerDay: 30, measuredDays: 2 });
  });

  it("compares with the first 7 measured days only after 14 days of measurement", () => {
    const first = ["10-01", "10-02", "10-03", "10-04", "10-05", "10-06", "10-07"].map((day) => row(`2026-${day}`, 100));
    const later = ["10-08", "10-09", "10-10", "10-11", "10-12", "10-13"].map((day) => row(`2026-${day}`, 40));
    const thirteenDays = confirmationWork({ inPeriod: later, all: [...first, ...later] });
    expect(thirteenDays.baselinePerDay).toBe(100);
    expect(thirteenDays.dropRate).toBeNull();

    const fourteen = [...later, row("2026-10-14", 40)];
    const result = confirmationWork({ inPeriod: fourteen, all: [...first, ...fourteen] });
    expect(result).toMatchObject({ minutesPerDay: 40, baselinePerDay: 100 });
    // From 100 to 40 min a day: 60% less.
    expect(result.dropRate).toBeCloseTo(0.6);
  });
});

describe("meta", () => {
  it("says on or off target by the table of PRD 8, and nothing without a value", () => {
    expect(targetStatus("noShow", 0.09)).toBe("on_target");
    expect(targetStatus("noShow", 0.1)).toBe("off_target");
    expect(targetStatus("autoConfirmation", 0.71)).toBe("on_target");
    expect(targetStatus("autoConfirmation", 0.7)).toBe("off_target");
    expect(targetStatus("confirmationTime", 0.6)).toBe("on_target");
    expect(targetStatus("confirmationTime", 0.59)).toBe("off_target");
    expect(targetStatus("googleCoverage", 0.81)).toBe("on_target");
    expect(targetStatus("syncFailures", 0.004)).toBe("on_target");
    expect(targetStatus("syncFailures", 0.005)).toBe("off_target");
    expect(targetStatus("delivery", 0.951)).toBe("on_target");
    expect(targetStatus("realization", 0.86)).toBe("on_target");
    expect(targetStatus("adoption", 0.91)).toBe("on_target");
    expect(targetStatus("noShow", null)).toBe("no_data");
    // Ocupação: "Acompanhar; meta por conta".
    expect(targetStatus("occupancy", 0.5)).toBe("no_target");
  });
});

describe("período", () => {
  const today = "2026-10-25";
  it("defaults to 30 days up to today, and takes only the three offered", () => {
    expect(parseIndicatorPeriod({}, today)).toEqual({ days: 30, start: "2026-09-26", endExclusive: "2026-10-26" });
    expect(parseIndicatorPeriod({ dias: "7" }, today)).toEqual({ days: 7, start: "2026-10-19", endExclusive: "2026-10-26" });
    expect(parseIndicatorPeriod({ dias: "90" }, today).start).toBe("2026-07-28");
    expect(parseIndicatorPeriod({ dias: "12" }, today).days).toBe(30);
    expect(parseIndicatorPeriod({ dias: ["7", "90"] }, today).days).toBe(30);
  });
});
