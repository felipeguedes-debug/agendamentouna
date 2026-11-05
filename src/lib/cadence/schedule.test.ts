import { describe, expect, it } from "vitest";
import { nextTuesdayAt10, planSteps, type PlanInput, type ScheduleStep } from "./schedule";

// When each cadence step fires (PRD 6; D-06, D-07): anchored on the booking or on
// the appointment, in the location's time zone, moved into the send window
// (anticipated, else postponed with the margin, else skipped), never for a moment
// already past at booking, and at most one automatic message per patient every 4 h.

const FORTALEZA = "America/Fortaleza";
const MANAUS = "America/Manaus";
/** Wall clock in Fortaleza (UTC-3, no daylight saving time). */
const fz = (date: string, time: string) => new Date(`${date}T${time}:00-03:00`);
/** Wall clock in Manaus (UTC-4). */
const mn = (date: string, time: string) => new Date(`${date}T${time}:00-04:00`);

const WINDOW = { start: "08:00", end: "20:00", days: [1, 2, 3, 4, 5, 6] };

const BOOKING: ScheduleStep = { id: "booking", anchor: "BOOKING", offsetMinutes: 0, fixedTime: null };
const D2_18H: ScheduleStep = { id: "d-2", anchor: "APPOINTMENT", offsetMinutes: -2880, fixedTime: "18:00" };
const D1_18H: ScheduleStep = { id: "d-1", anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00" };
const H3: ScheduleStep = { id: "h-3", anchor: "APPOINTMENT", offsetMinutes: -180, fixedTime: null };

function plan(input: Partial<PlanInput> & Pick<PlanInput, "steps" | "startedAt" | "startsAt">) {
  return planSteps({ timeZone: FORTALEZA, window: WINDOW, marginMinutes: 120, ...input });
}

function byStep(results: ReturnType<typeof planSteps>) {
  return Object.fromEntries(results.map((result) => [result.stepId, result]));
}

describe("planSteps", () => {
  it("anchors steps on the booking and on the appointment, with the fixed time on the local day", () => {
    const result = byStep(plan({ steps: [BOOKING, D1_18H], startedAt: fz("2026-11-09", "10:00"), startsAt: fz("2026-11-11", "10:00") }));
    expect(result.booking).toMatchObject({ at: fz("2026-11-09", "10:00"), adjustment: "none" });
    expect(result["d-1"]).toMatchObject({ at: fz("2026-11-10", "18:00"), adjustment: "none" });
  });

  it("reads the fixed time and the window in the location's time zone", () => {
    const result = byStep(
      plan({ steps: [D1_18H, H3], timeZone: MANAUS, startedAt: mn("2026-11-09", "10:00"), startsAt: mn("2026-11-11", "14:00") }),
    );
    expect(result["d-1"]).toMatchObject({ at: mn("2026-11-10", "18:00") });
    expect(result["h-3"]).toMatchObject({ at: mn("2026-11-11", "11:00") });
  });

  it("anticipates a step before the appointment to the last valid time before it", () => {
    // Monday appointment: D-1 at 18h falls on Sunday, outside the window, and goes to Saturday at 20h.
    const result = byStep(plan({ steps: [D1_18H], startedAt: fz("2026-11-02", "10:00"), startsAt: fz("2026-11-09", "10:00") }));
    expect(result["d-1"]).toMatchObject({ at: fz("2026-11-07", "20:00"), adjustment: "anticipated" });
  });

  it("anticipates to the end of the same day when the step falls after the window", () => {
    const result = byStep(
      plan({ steps: [{ ...D1_18H, fixedTime: "21:30" }], startedAt: fz("2026-11-02", "10:00"), startsAt: fz("2026-11-11", "10:00") }),
    );
    expect(result["d-1"]).toMatchObject({ at: fz("2026-11-10", "20:00"), adjustment: "anticipated" });
  });

  it("counts the end of the window as a valid time", () => {
    const result = byStep(
      plan({ steps: [{ ...D1_18H, fixedTime: "20:00" }], startedAt: fz("2026-11-02", "10:00"), startsAt: fz("2026-11-11", "10:00") }),
    );
    expect(result["d-1"]).toMatchObject({ at: fz("2026-11-10", "20:00"), adjustment: "none" });
  });

  it("postpones when the anticipated time has passed, keeping the margin before the appointment", () => {
    // Booked on Saturday at 21h for Monday at 11h: Saturday 20h has passed, Monday 8h is 3 h before.
    const result = byStep(plan({ steps: [D1_18H], startedAt: fz("2026-11-07", "21:00"), startsAt: fz("2026-11-09", "11:00") }));
    expect(result["d-1"]).toMatchObject({ at: fz("2026-11-09", "08:00"), adjustment: "postponed" });
  });

  it("skips the step when the postponed time does not leave the margin", () => {
    const result = byStep(plan({ steps: [D1_18H], startedAt: fz("2026-11-07", "21:00"), startsAt: fz("2026-11-09", "09:00") }));
    expect(result["d-1"]).toMatchObject({ skipped: "outside_window" });
  });

  it("uses the practice's margin", () => {
    const result = byStep(
      plan({ steps: [D1_18H], marginMinutes: 30, startedAt: fz("2026-11-07", "21:00"), startsAt: fz("2026-11-09", "09:00") }),
    );
    expect(result["d-1"]).toMatchObject({ at: fz("2026-11-09", "08:00"), adjustment: "postponed" });
  });

  it("skips a step whose time had already passed when the appointment was booked", () => {
    const result = byStep(plan({ steps: [D2_18H, D1_18H], startedAt: fz("2026-11-10", "19:00"), startsAt: fz("2026-11-11", "15:00") }));
    expect(result["d-2"]).toMatchObject({ skipped: "passed" });
    expect(result["d-1"]).toMatchObject({ skipped: "passed" });
  });

  it("only postpones the booking step, with the margin", () => {
    const sunday = byStep(plan({ steps: [BOOKING], startedAt: fz("2026-11-08", "10:00"), startsAt: fz("2026-11-10", "10:00") }));
    expect(sunday.booking).toMatchObject({ at: fz("2026-11-09", "08:00"), adjustment: "postponed" });
    const lateNight = byStep(plan({ steps: [BOOKING], startedAt: fz("2026-11-09", "22:00"), startsAt: fz("2026-11-10", "09:00") }));
    expect(lateNight.booking).toMatchObject({ skipped: "outside_window" });
  });

  it("sends the booking step at once inside the window, even close to the appointment", () => {
    const result = byStep(plan({ steps: [BOOKING], startedAt: fz("2026-11-10", "09:00"), startsAt: fz("2026-11-10", "10:00") }));
    expect(result.booking).toMatchObject({ at: fz("2026-11-10", "09:00"), adjustment: "none" });
  });

  it("keeps 4 h between automatic messages to the patient, postponing the later step", () => {
    // Booked Monday 15h for Tuesday 10h: the D-1 request at 18h comes 3 h after the
    // booking message and moves to 19h; the H-3 (7h, anticipated to Monday 20h) moves
    // past 23h, out of the window, to Tuesday 8h, exactly the 2 h margin.
    const result = byStep(
      plan({ steps: [BOOKING, D1_18H, H3], startedAt: fz("2026-11-09", "15:00"), startsAt: fz("2026-11-10", "10:00") }),
    );
    expect(result.booking).toMatchObject({ at: fz("2026-11-09", "15:00") });
    expect(result["d-1"]).toMatchObject({ at: fz("2026-11-09", "19:00"), adjustment: "rate_limited" });
    expect(result["h-3"]).toMatchObject({ at: fz("2026-11-10", "08:00"), adjustment: "rate_limited" });
  });

  it("skips a step the 4 h limit pushes past the margin", () => {
    const result = byStep(
      plan({ steps: [BOOKING, H3], startedAt: fz("2026-11-10", "09:00"), startsAt: fz("2026-11-10", "14:00") }),
    );
    expect(result.booking).toMatchObject({ at: fz("2026-11-10", "09:00") });
    expect(result["h-3"]).toMatchObject({ skipped: "rate_limit" });
  });

  it("counts the patient's other messages in the 4 h limit", () => {
    const result = byStep(
      plan({
        steps: [D1_18H],
        startedAt: fz("2026-11-02", "10:00"),
        startsAt: fz("2026-11-11", "10:00"),
        previousSends: [fz("2026-11-10", "16:00")],
      }),
    );
    expect(result["d-1"]).toMatchObject({ at: fz("2026-11-10", "20:00"), adjustment: "rate_limited" });
  });

  it("returns the steps in the given order", () => {
    const results = plan({ steps: [H3, BOOKING, D1_18H], startedAt: fz("2026-11-02", "10:00"), startsAt: fz("2026-11-11", "10:00") });
    expect(results.map((result) => result.stepId)).toEqual(["h-3", "booking", "d-1"]);
  });
});

describe("nextTuesdayAt10", () => {
  it("is the coming Tuesday at 10h in the time zone", () => {
    expect(nextTuesdayAt10(FORTALEZA, fz("2026-10-28", "15:00"))).toEqual(fz("2026-11-03", "10:00"));
    expect(nextTuesdayAt10(MANAUS, mn("2026-11-02", "23:30"))).toEqual(mn("2026-11-03", "10:00"));
  });

  it("skips to the next week on a Tuesday", () => {
    expect(nextTuesdayAt10(FORTALEZA, fz("2026-11-03", "07:00"))).toEqual(fz("2026-11-10", "10:00"));
  });

  it("gives the preview of the mockup's cadence", () => {
    // Procedimento com preparo, saved on Wednesday 15h: the D-2 reminder on Sunday is
    // anticipated to Saturday 20h; the D-1 request goes on Monday 18h; the H-3 goes
    // past the window and the 4 h limit to Tuesday 8h.
    const now = fz("2026-10-28", "15:00");
    const results = byStep(
      planSteps({ steps: [BOOKING, D2_18H, D1_18H, H3], startedAt: now, startsAt: nextTuesdayAt10(FORTALEZA, now), timeZone: FORTALEZA, window: WINDOW, marginMinutes: 120 }),
    );
    expect(results.booking).toMatchObject({ at: now });
    expect(results["d-2"]).toMatchObject({ at: fz("2026-10-31", "20:00"), adjustment: "anticipated" });
    expect(results["d-1"]).toMatchObject({ at: fz("2026-11-02", "18:00") });
    expect(results["h-3"]).toMatchObject({ at: fz("2026-11-03", "08:00") });
  });
});
