import { describe, expect, it } from "vitest";
import { formatCents, parseMoneyToCents } from "./money";

// Money is kept in cents (Int); the screens show and read Brazilian reais.

describe("formatCents", () => {
  it("formats reais with the pt-BR separators", () => {
    expect(formatCents(120050)).toBe("R$ 1.200,50");
    expect(formatCents(0)).toBe("R$ 0,00");
    expect(formatCents(5)).toBe("R$ 0,05");
  });

  it("drops the cents when they are zero in the compact form, like the mockups", () => {
    expect(formatCents(80000, { compact: true })).toBe("R$ 800");
    expect(formatCents(1435000, { compact: true })).toBe("R$ 14.350");
    expect(formatCents(80050, { compact: true })).toBe("R$ 800,50");
  });
});

describe("parseMoneyToCents", () => {
  it("reads what a person types in a value field", () => {
    expect(parseMoneyToCents("800")).toBe(80000);
    expect(parseMoneyToCents("800,00")).toBe(80000);
    expect(parseMoneyToCents("800,5")).toBe(80050);
    expect(parseMoneyToCents("1.200,50")).toBe(120050);
    expect(parseMoneyToCents("R$ 1.200")).toBe(120000);
    expect(parseMoneyToCents(" 0 ")).toBe(0);
  });

  it("rejects anything ambiguous or negative", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("-10")).toBeNull();
    expect(parseMoneyToCents("1.20")).toBeNull();
    expect(parseMoneyToCents("10,555")).toBeNull();
    expect(parseMoneyToCents("1,200.50")).toBeNull();
  });
});
