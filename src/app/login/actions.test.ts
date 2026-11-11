import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENTRY_NOTICE_COOKIE, entryNoticeValue } from "@/lib/legal/notice";
import { interruption } from "../../../tests/helpers/auth";
import { acceptEntryNotice } from "./actions";

const store = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => store }));

// "Li e concordo" on the notice before the login (D-106): the device keeps the versions it
// agreed to, and the login opens on the page that was asked for.

function form(next?: string) {
  const data = new FormData();
  if (next !== undefined) data.set("next", next);
  return data;
}

beforeEach(() => store.set.mockClear());

describe("acceptEntryNotice", () => {
  it("keeps the current versions on the device, out of reach of the page's scripts", async () => {
    await interruption(acceptEntryNotice(form()));

    expect(store.set).toHaveBeenCalledTimes(1);
    const [name, value, options] = store.set.mock.calls[0];
    expect(name).toBe(ENTRY_NOTICE_COOKIE);
    expect(value).toBe(entryNoticeValue());
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    expect(options.maxAge).toBeGreaterThanOrEqual(60 * 60 * 24 * 365);
  });

  it("goes back to the login, with the page asked for", async () => {
    expect(await interruption(acceptEntryNotice(form("/pwa")))).toBe(`redirect:/login?next=${encodeURIComponent("/pwa")}`);
    expect(await interruption(acceptEntryNotice(form()))).toBe("redirect:/login");
  });

  it("never sends anyone off the site", async () => {
    for (const next of ["https://example.com", "//example.com", "/\\example.com"]) {
      expect(await interruption(acceptEntryNotice(form(next))), next).toBe("redirect:/login");
    }
  });
});
