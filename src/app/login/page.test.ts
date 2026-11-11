import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ENTRY_NOTICE_COOKIE, entryNoticeValue } from "@/lib/legal/notice";
import { PRIVACY_VERSION } from "@/lib/legal/privacy";
import { setRequestCookie } from "../../../tests/helpers/auth";
import LoginPage from "./page";

vi.mock("next/headers");
// The login form is a Client Component; outside the App Router it has no router.
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

// The notice before the login (D-106): the terms of use and the privacy policy, once per
// device. It says "concordo" and not "autorizo": the agenda rests on the contract (D-19),
// and a consent asked as the price of entry may not be valid under the LGPD. The texts are
// still provisional (D-38, D-99), and the notice says so.

async function render(searchParams: Record<string, string> = {}, cookie = "") {
  await setRequestCookie(cookie);
  const page = await LoginPage({ searchParams: Promise.resolve(searchParams), params: Promise.resolve({}) } as never);
  return renderToStaticMarkup(page);
}

const accepted = `${ENTRY_NOTICE_COOKIE}=${entryNoticeValue()}`;
const dialog = /role="dialog"/;

describe("the login page", () => {
  it("shows the notice over the login on a device that has not agreed", async () => {
    const html = await render();
    expect(html).toMatch(dialog);
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Antes de entrar");
    expect(html).toContain('href="/termos"');
    expect(html).toContain('href="/privacidade"');
    expect(html).toContain("Li e concordo");
    expect(html).toContain("Não concordo");
    expect(html).toMatch(/provisórios/);
    expect(html).not.toMatch(/autorizo/i);
  });

  it("keeps the login out of reach behind the notice", async () => {
    const html = await render();
    expect(html).toMatch(/<div[^>]* inert=""[^>]*>(?:(?!role="dialog")[\s\S])*id="email"/);
  });

  it("shows the login alone once the device has agreed to the current versions", async () => {
    const html = await render({}, accepted);
    expect(html).not.toMatch(dialog);
    expect(html).not.toContain("inert");
    expect(html).toContain('id="email"');
    // The home page that Google opens is one click away (D-99).
    expect(html).toContain('href="/inicio"');
  });

  it("shows the notice again when the policy has a new version", async () => {
    const old = `${ENTRY_NOTICE_COOKIE}=${entryNoticeValue(undefined, `${PRIVACY_VERSION}-anterior`)}`;
    expect(await render({}, old)).toMatch(dialog);
  });

  it("says, after 'Não concordo', that there is no entry without it and whom to ask", async () => {
    const html = await render({ aviso: "recusado" });
    expect(html).toMatch(dialog);
    expect(html).toContain("Sem o aceite, não é possível entrar");
    expect(html).toContain("consultório que enviou o seu convite");
    expect(html).toContain("Li e concordo");
    expect(html).not.toContain("Não concordo");
    // The button that is left describes itself with the message, for a screen reader.
    const describedBy = /<button[^>]*aria-describedby="([^"]+)"[^>]*>Li e concordo/.exec(html)?.[1];
    expect(describedBy).toBeTruthy();
    expect(html).toMatch(new RegExp(`id="${describedBy}"[^>]*>Sem o aceite`));
  });

  it("keeps the page asked for, in both answers", async () => {
    const html = await render({ next: "/pwa" });
    expect(html).toContain('href="/login?aviso=recusado&amp;next=%2Fpwa"');
    expect(html).toMatch(/name="next" value="\/pwa"/);
  });

  it("drops a next that leaves the site", async () => {
    const html = await render({ next: "https://example.com" });
    expect(html).toContain('href="/login?aviso=recusado"');
    expect(html).not.toContain("example.com");
  });
});
