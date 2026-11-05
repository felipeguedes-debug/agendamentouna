import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "./phone";

// Patients' phones are stored in E.164, unique per practice; the import
// deduplicates on them (D-18).

describe("normalizePhone", () => {
  it("accepts a Brazilian mobile with area code, however it is typed", () => {
    expect(normalizePhone("(85) 99812-4455")).toBe("+5585998124455");
    expect(normalizePhone("85998124455")).toBe("+5585998124455");
    expect(normalizePhone("+55 85 99812 4455")).toBe("+5585998124455");
    expect(normalizePhone("085 99812-4455")).toBe("+5585998124455");
  });

  it("accepts a landline with area code", () => {
    expect(normalizePhone("(85) 3212-3456")).toBe("+558532123456");
  });

  it("rejects numbers without area code or with an invalid shape", () => {
    expect(normalizePhone("99812-4455")).toBeNull();
    expect(normalizePhone("(85) 89812-4455")).toBeNull();
    expect(normalizePhone("(00) 99812-4455")).toBeNull();
    expect(normalizePhone("+55 85 99812 44556")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("abc")).toBeNull();
  });
});

describe("formatPhone", () => {
  it("formats stored numbers for the screens", () => {
    expect(formatPhone("+5585998124455")).toBe("(85) 99812-4455");
    expect(formatPhone("+558532123456")).toBe("(85) 3212-3456");
    expect(formatPhone(null)).toBe("");
    expect(formatPhone("+14155550100")).toBe("+14155550100");
  });
});
