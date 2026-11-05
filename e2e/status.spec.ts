import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_PASSWORD, GOOGLE_SECRETARY_EMAIL, MANAGER_EMAIL, SECRETARY_EMAIL } from "./data";

// D-39, D-40 and D-72: the HTTP status of a denied page. Only a production build shows
// it (next dev has no prerendered shell), and a shell from Next or a <Suspense> or
// loading.tsx above the check in src/lib/auth/guard.ts turns these answers into a 200
// with the same page on screen, so nothing else would notice.

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

test("a screen the role does not allow answers 403 and one it allows answers 200", async ({ page }) => {
  const practicePath = await signIn(page, SECRETARY_EMAIL);

  const home = await page.goto(practicePath);
  expect(home?.status()).toBe(200);

  for (const screen of ["regua", "integracoes", "usuarios", "unidades", "unidades/horarios", "saude", "auditoria"]) {
    const denied = await page.goto(`${practicePath}/${screen}`);
    expect(denied?.status(), screen).toBe(403);
    await expect(page.getByRole("heading", { name: "Sem permissão" })).toBeVisible();
  }

  await page.context().clearCookies();
  await signIn(page, MANAGER_EMAIL);
  for (const screen of ["regua", "integracoes", "usuarios", "unidades", "unidades/horarios", "saude", "auditoria"]) {
    const allowed = await page.goto(`${practicePath}/${screen}`);
    expect(allowed?.status(), screen).toBe(200);
    await expect(page.getByRole("heading", { name: "Sem permissão" })).toHaveCount(0);
  }
});

test("a practice without access answers 404, the same as one that does not exist", async ({ page }) => {
  // A real practice of the same organization, which the first secretary cannot enter.
  const otherPractice = await signIn(page, GOOGLE_SECRETARY_EMAIL);
  await page.context().clearCookies();
  const practicePath = await signIn(page, SECRETARY_EMAIL);
  expect(otherPractice).not.toBe(practicePath);

  const noSuchId = "00000000-0000-4000-8000-000000000000";
  for (const path of [otherPractice, `${otherPractice}/regua`, `/conta/${noSuchId}`, `/conta/${noSuchId}/regua`, `${practicePath}/pacientes/${noSuchId}`]) {
    const missing = await page.goto(path);
    expect(missing?.status(), path).toBe(404);
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  }
});

test("what was denied above is no error: the panel of the practice stays clean (D-101)", async ({ page }) => {
  const practicePath = await signIn(page, MANAGER_EMAIL);
  await page.goto(`${practicePath}/saude`);
  await expect(page.getByRole("heading", { name: "Erros do sistema" })).toBeVisible();
  await expect(page.getByText("Nenhum no período.")).toBeVisible();
});

test("the redirects of the session check answer 307", async ({ page, request }) => {
  const practicePath = await signIn(page, SECRETARY_EMAIL);

  // page.request shares the session of the browser; maxRedirects: 0 shows the answer itself.
  const start = await page.request.get("/", { maxRedirects: 0 });
  expect(start.status()).toBe(307);
  expect(start.headers().location).toBe(practicePath);

  // With a cookie the proxy lets it through, and the check in the page redirects. Without
  // one the proxy answers, and it is the proxy that adds ?next=.
  const expired = await request.get(practicePath, { maxRedirects: 0, headers: { cookie: "better-auth.session_token=expired" } });
  expect(expired.status()).toBe(307);
  expect(expired.headers().location).toBe("/login");

  const anonymous = await request.get(practicePath, { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  expect(anonymous.headers().location).toBe(`/login?next=${encodeURIComponent(practicePath)}`);
});
