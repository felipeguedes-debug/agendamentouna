import { describe, expect, it } from "vitest";
import { confirmationPushBody, pushTtlSeconds } from "./rules";

// PRD 7 and D-78: the text of the notice, which shows on a locked screen.

const FORTALEZA = "America/Fortaleza";
const NOW = new Date("2026-10-21T18:00:00-03:00");

describe("confirmationPushBody", () => {
  it("tells only the time when it is today", () => {
    expect(confirmationPushBody(new Date("2026-10-21T19:30:00-03:00"), FORTALEZA, NOW)).toBe("Um paciente confirmou o horário das 19:30.");
  });

  it("says tomorrow, where most confirmations land (the request goes out the day before)", () => {
    expect(confirmationPushBody(new Date("2026-10-22T14:30:00-03:00"), FORTALEZA, NOW)).toBe("Um paciente confirmou o horário de amanhã, às 14:30.");
  });

  it("gives the date when it is later", () => {
    expect(confirmationPushBody(new Date("2026-10-30T08:00:00-03:00"), FORTALEZA, NOW)).toBe("Um paciente confirmou o horário de 30/10/2026, às 08:00.");
  });

  it("reads the time and the day in the location's time zone", () => {
    const at = new Date("2026-10-22T00:30:00-03:00");
    expect(confirmationPushBody(at, "America/Manaus", new Date("2026-10-21T18:00:00-03:00"))).toBe("Um paciente confirmou o horário das 23:30.");
  });
});

describe("pushTtlSeconds", () => {
  it("lasts until the visit, at most a day", () => {
    expect(pushTtlSeconds(new Date(NOW.getTime() + 3_600_000), NOW)).toBe(3600);
    expect(pushTtlSeconds(new Date(NOW.getTime() + 5 * 86_400_000), NOW)).toBe(86_400);
    expect(pushTtlSeconds(new Date(NOW.getTime() - 1000), NOW)).toBe(0);
  });
});
