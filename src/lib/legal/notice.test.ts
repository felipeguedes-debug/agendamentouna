import { describe, expect, it } from "vitest";
import { ENTRY_NOTICE_COOKIE, entryNoticeAccepted, entryNoticeValue } from "./notice";
import { PRIVACY_VERSION } from "./privacy";
import { TERMS_VERSION } from "./terms";

// The notice before the login (D-106): once per device, kept in a cookie with the versions
// of the terms and of the privacy policy, so a new version of either brings it back.

describe("the entry notice", () => {
  it("carries both versions in the cookie", () => {
    expect(entryNoticeValue()).toContain(TERMS_VERSION);
    expect(entryNoticeValue()).toContain(PRIVACY_VERSION);
    expect(ENTRY_NOTICE_COOKIE).toMatch(/^[a-z._-]+$/);
  });

  it("counts as accepted only with the current versions", () => {
    expect(entryNoticeAccepted(entryNoticeValue())).toBe(true);
    expect(entryNoticeAccepted(undefined)).toBe(false);
    expect(entryNoticeAccepted("")).toBe(false);
    expect(entryNoticeAccepted(entryNoticeValue(TERMS_VERSION, "2026-01-01-antiga"))).toBe(false);
    expect(entryNoticeAccepted(entryNoticeValue("2026-01-01-antiga", PRIVACY_VERSION))).toBe(false);
  });

  it("is a value a browser sends as it is, without encoding", () => {
    expect(entryNoticeValue()).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});
