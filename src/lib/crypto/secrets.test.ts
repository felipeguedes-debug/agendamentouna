import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, sameSecret, SecretError } from "./secrets";

// Provider tokens are stored encrypted (PRD 7, Segurança).

const testKey = process.env.TOKEN_ENCRYPTION_KEY;

afterEach(() => {
  process.env.TOKEN_ENCRYPTION_KEY = testKey;
});

describe("secrets", () => {
  it("round-trips a token without storing it in clear", () => {
    const stored = encryptSecret("instance-token-123");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("instance-token-123");
    expect(decryptSecret(stored)).toBe("instance-token-123");
  });

  it("uses a new nonce every time", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("refuses tampered data, another key and plain text", () => {
    const stored = encryptSecret("token");
    const bytes = Buffer.from(stored.slice(3), "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => decryptSecret(`v1:${bytes.toString("base64")}`)).toThrow(SecretError);
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    expect(() => decryptSecret(stored)).toThrow(SecretError);
    expect(() => decryptSecret("seed:not-a-real-token")).toThrow(SecretError);
  });

  it("requires a 32-byte key", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "short";
    expect(() => encryptSecret("token")).toThrow(SecretError);
  });

  it("compares credentials", () => {
    expect(sameSecret("abc", "abc")).toBe(true);
    expect(sameSecret("abc", "abd")).toBe(false);
    expect(sameSecret("abc", "abcd")).toBe(false);
  });
});
