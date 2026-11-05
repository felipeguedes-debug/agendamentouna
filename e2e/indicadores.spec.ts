import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_PASSWORD, PWA_MANAGER_EMAIL, PWA_SECRETARY_EMAIL } from "./data";

// Block 8 (PRD 8, D-74, D-75): the panel in a real browser. The practice of e2e/prepare-database.ts
// has, three days ago, 3 Atendido, 1 Faltou and 1 Sem baixa: 1 ÷ (3 + 1) = 25%. Its other
// numbers are counted by hand in src/lib/indicators/seed.test.ts.

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

test("the manager reads the indicators, with Sem baixa apart and no number for what was not measured", async ({ page }) => {
  await signIn(page, PWA_MANAGER_EMAIL);
  await page.getByRole("link", { name: "Indicadores" }).click();
  await expect(page.getByRole("heading", { name: "Indicadores", level: 1 })).toBeVisible();

  await page.getByRole("link", { name: "7 dias" }).click();
  await expect(page).toHaveURL(/dias=7/);

  const noShow = page.getByTestId("indicator-noShow");
  await expect(noShow.getByTestId("value")).toHaveText("25%");
  await expect(noShow.getByTestId("without-closing")).toHaveText("1 sem baixa");
  await expect(noShow).toContainText("Fora da meta");

  const byType = page.getByTestId("no-show-row");
  await expect(byType).toHaveCount(1);
  await expect(byType).toContainText("25%");

  // Never measured: the secretary never worked the list, and nothing was sent or exported.
  for (const id of ["confirmationTime", "syncFailures", "delivery"]) {
    await expect(page.getByTestId(`indicator-${id}`).getByTestId("value")).toHaveText("Sem dados");
  }
});

test("the secretary has no such screen (403), and no menu entry for it", async ({ page }) => {
  const practicePath = await signIn(page, PWA_SECRETARY_EMAIL);
  await expect(page.getByRole("link", { name: "Indicadores" })).toHaveCount(0);
  const response = await page.goto(`${practicePath}/indicadores`);
  expect(response?.status()).toBe(403);
});
