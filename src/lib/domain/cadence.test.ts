import { describe, expect, it } from "vitest";
import { describeCadenceStep } from "./cadence";

// The cadence preview of the booking form lists the steps as they read in PRD 6.

describe("describeCadenceStep", () => {
  it("describes the triggers of the seed cadences", () => {
    expect(describeCadenceStep({ anchor: "BOOKING", offsetMinutes: 0, fixedTime: null, action: "REMINDER" })).toBe("Ao agendar · lembrete");
    expect(describeCadenceStep({ anchor: "APPOINTMENT", offsetMinutes: -1440, fixedTime: "18:00", action: "REQUEST_CONFIRMATION" })).toBe(
      "1 dia antes, às 18h · pedido de confirmação",
    );
    expect(describeCadenceStep({ anchor: "APPOINTMENT", offsetMinutes: -2880, fixedTime: "18:30", action: "REMINDER" })).toBe("2 dias antes, às 18h30 · lembrete");
    expect(describeCadenceStep({ anchor: "APPOINTMENT", offsetMinutes: -180, fixedTime: null, action: "REQUEST_CONFIRMATION" })).toBe(
      "3 h antes · pedido de confirmação",
    );
    expect(describeCadenceStep({ anchor: "APPOINTMENT", offsetMinutes: 120, fixedTime: null, action: "REMINDER" })).toBe("2 h depois · lembrete");
  });
});
