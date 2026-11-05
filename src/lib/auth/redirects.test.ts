import { describe, expect, it } from "vitest";
import { safeNextPath, withNext } from "./redirects";

// The `next` parameter of the login page must never send the user to another site.

describe("safeNextPath", () => {
  it("keeps a path of this site, with its query", () => {
    expect(safeNextPath("/conta/abc/regua?semana=2")).toBe("/conta/abc/regua?semana=2");
  });

  it("drops anything that could leave the site", () => {
    for (const value of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "conta", ""]) {
      expect(safeNextPath(value), value).toBeUndefined();
    }
  });

  it("drops a missing value and repeated parameters", () => {
    expect(safeNextPath(undefined)).toBeUndefined();
    expect(safeNextPath(["/a", "/b"])).toBeUndefined();
  });
});

describe("withNext", () => {
  it("appends a safe next path", () => {
    expect(withNext("/login/segundo-fator", "/conta/abc")).toBe("/login/segundo-fator?next=%2Fconta%2Fabc");
    expect(withNext("/login/segundo-fator", undefined)).toBe("/login/segundo-fator");
  });
});
