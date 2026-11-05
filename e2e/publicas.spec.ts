import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_PASSWORD, MANAGER_EMAIL } from "./data";

// The public pages (D-99) and the security headers (D-102), on the production build. A
// page rendered ahead of time would have scripts without the nonce, and only a browser
// shows that: the page opens, nothing reacts, and the console has the refusal.

const shown = (locator: Locator) => locator.filter({ visible: true });

/** See the note in e2e/google.spec.ts on the sign-in limit. */
async function signIn(page: Page, email: string) {
  for (let attempt = 1; ; attempt += 1) {
    await page.goto("/login");
    await shown(page.getByLabel("E-mail")).fill(email);
    await shown(page.getByLabel("Senha")).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    try {
      await expect(page).toHaveURL(/\/conta\/[0-9a-f-]{36}$/);
      return new URL(page.url()).pathname;
    } catch (error) {
      if (attempt > 1 || !(await page.getByText("Muitas tentativas").isVisible())) throw error;
      await page.waitForTimeout(10_000);
    }
  }
}

/** What the browser refused because of the security policy, while the test ran. */
function collectViolations(page: Page) {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (/content security policy/i.test(message.text())) violations.push(message.text());
  });
  page.on("pageerror", (error) => {
    if (/content security policy/i.test(error.message)) violations.push(error.message);
  });
  return violations;
}

test("a visitor sees the home page at the site's address, with no login in the way", async ({ page }) => {
  const violations = collectViolations(page);
  const home = await page.goto("/");
  expect(home?.status()).toBe(200);
  expect(new URL(page.url()).pathname).toBe("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("WhatsApp e Google Agenda");

  await page.getByRole("link", { name: "Política de privacidade" }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
  await expect(page.getByRole("heading", { name: "Política de privacidade" })).toBeVisible();
  await expect(page.getByText("Texto provisório")).toBeVisible();
  await expect(page.getByText("Uso Limitado")).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(violations).toEqual([]);
});

test("the login and the terms link to the policy", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");
  expect((await page.request.get("/privacidade")).status()).toBe(200);
  expect((await page.request.get("/termos")).status()).toBe(200);
});

test("every page carries the security headers, and the policy has a new nonce each time", async ({ request }) => {
  for (const path of ["/", "/inicio", "/privacidade", "/termos", "/login", "/esqueci-senha"]) {
    const answer = await request.get(path);
    expect(answer.status(), path).toBe(200);
    const headers = answer.headers();
    expect(headers["content-security-policy"], path).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["strict-transport-security"], path).toBe("max-age=63072000");
    expect(headers["permissions-policy"], path).toContain("camera=()");
    expect(headers["x-powered-by"], path).toBeUndefined();
  }
  const first = (await request.get("/login")).headers()["content-security-policy"];
  const second = (await request.get("/login")).headers()["content-security-policy"];
  expect(first).not.toBe(second);
});

test("the headers that do not depend on the request are on files and the API too", async ({ request }) => {
  for (const path of ["/sw.js", "/offline.html", "/api/auth/get-session"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
  }
  // The service worker keeps its own policy (D-76).
  expect((await request.get("/sw.js")).headers()["content-security-policy"]).toBe("default-src 'self'; script-src 'self'");
});

test("the scripts of a signed-in page carry the nonce of its answer and nothing is refused", async ({ page }) => {
  const violations = collectViolations(page);
  const practicePath = await signIn(page, MANAGER_EMAIL);

  const answer = await page.goto(practicePath);
  const nonce = /'nonce-([^']+)'/.exec(answer?.headers()["content-security-policy"] ?? "")?.[1];
  expect(nonce).toBeTruthy();
  // The browser hides a nonce from the attribute, and keeps it in the property.
  const nonces = await page.locator("script").evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).nonce));
  expect(nonces.length).toBeGreaterThan(0);
  expect(new Set(nonces)).toEqual(new Set([nonce]));

  // React is alive: the panel opens by a click, and the screens below load their scripts.
  await page.goto(`${practicePath}/configuracoes`);
  await expect(page.getByRole("link", { name: "Profissionais" }).first()).toBeVisible();
  await page.goto(`${practicePath}/pacientes`);
  await page.getByRole("link", { name: /Adicionar paciente/ }).first().click();
  await expect(page).toHaveURL(/novo=1/);
  expect(violations).toEqual([]);
});

test("what gets into the page's HTML does not run, as in a stored XSS", async ({ page }) => {
  const violations = collectViolations(page);
  // The same answer from the server, with its policy, and the attack written into the markup.
  await page.route("**/login", async (route) => {
    const response = await route.fetch();
    const attack = '<script>window.__inline = true</script><img src="/nao-existe.png" onerror="window.__handler = true"><script src="https://example.com/x.js"></script>';
    await route.fulfill({ response, body: (await response.text()).replace("</body>", `${attack}</body>`) });
  });
  await page.goto("/login");
  await expect.poll(() => violations.length).toBeGreaterThanOrEqual(3);
  const ran = await page.evaluate(() => {
    const target = window as unknown as { __inline?: boolean; __handler?: boolean };
    return { inline: Boolean(target.__inline), handler: Boolean(target.__handler) };
  });
  expect(ran).toEqual({ inline: false, handler: false });

  // The app's own scripts, with the nonce, still ran: the form answers to React.
  await shown(page.getByLabel("E-mail")).fill("ninguem@example.com");
  await shown(page.getByLabel("Senha")).fill("senha-errada-123");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
});

test("a practice's page cannot be framed: the policy and the old header both say so", async ({ page, request }) => {
  const practicePath = await signIn(page, MANAGER_EMAIL);
  const headers = (await page.request.get(practicePath)).headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect((await request.get("/login")).headers()["x-frame-options"]).toBe("DENY");
});
