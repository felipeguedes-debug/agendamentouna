import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_PASSWORD, fortalezaDay, GOOGLE_ACCOUNT_EMAIL, GOOGLE_APPOINTMENT_ID, GOOGLE_PATIENT, GOOGLE_SECRETARY_EMAIL } from "./data";

// Block 6 (PRD 12): done criterion — a block created in Google shows in the agenda
// (the 4-minute polling, run here at once); an event dragged in Google becomes a
// pending change; the practice's own secondary calendar never comes back as a
// block; an all-day event blocks. The professional's side in Google is played by
// scripts/google-sandbox.ts against the sandbox Google of the test database.

// Tests look only at what is on screen.
const shown = (locator: Locator) => locator.filter({ visible: true });

/** Runs `npm run google:sandbox -- <args>` on the test database, as the professional in Google or as the polling. */
function google(...args: string[]) {
  const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  return execFileSync(process.execPath, [tsx, path.join("scripts", "google-sandbox.ts"), ...args], {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST, GOOGLE_CALENDAR_PROVIDER: "sandbox" },
    encoding: "utf8",
  });
}

/**
 * The sign-in limit of /api/auth (Better Auth: 3 tries every 10 s per address) is
 * reached when the flows sign in back to back; then the helper waits and tries again.
 */
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

test("busy Google events and a free all-day event block the agenda; the practice's own calendar does not", async ({ page }) => {
  google("evento", "--email", GOOGLE_ACCOUNT_EMAIL, "--inicio", `${fortalezaDay(1)} 14:00`, "--fim", `${fortalezaDay(1)} 15:00`, "--titulo", "Cirurgia no hospital");
  google("evento", "--email", GOOGLE_ACCOUNT_EMAIL, "--dia", fortalezaDay(3), "--livre", "--titulo", "Congresso");
  google("sincronizar");

  const practicePath = await signIn(page, GOOGLE_SECRETARY_EMAIL);
  await page.goto(`${practicePath}?visao=dia&data=${fortalezaDay(1)}`);
  await expect(shown(page.getByText("Compromisso Google"))).toHaveCount(1);
  await expect(shown(page.getByText("14:00 às 15:00"))).toBeVisible();
  await expect(shown(page.getByText("Cirurgia no hospital"))).toHaveCount(0);

  await page.goto(`${practicePath}?visao=dia&data=${fortalezaDay(3)}`);
  await expect(shown(page.getByText("Compromisso Google"))).toHaveCount(1);
  await expect(shown(page.getByText("Dia inteiro")).first()).toBeVisible();

  // The appointment is in the secondary calendar, which is output only.
  await page.goto(`${practicePath}?visao=dia&data=${fortalezaDay(2)}`);
  await expect(shown(page.getByTestId("appointment-card")).filter({ hasText: GOOGLE_PATIENT.name })).toHaveCount(1);
  await expect(shown(page.getByText("Compromisso Google"))).toHaveCount(0);
});

test("an event dragged in Google becomes a pending change, which the secretary accepts", async ({ page }) => {
  google("mover", "--agendamento", GOOGLE_APPOINTMENT_ID, "--inicio", `${fortalezaDay(2)} 11:00`, "--fim", `${fortalezaDay(2)} 11:30`);
  google("sincronizar");

  const practicePath = await signIn(page, GOOGLE_SECRETARY_EMAIL);
  // Nothing moved in the agenda: the appointment waits for a decision.
  await page.goto(`${practicePath}?visao=dia&data=${fortalezaDay(2)}`);
  const card = shown(page.getByTestId("appointment-card")).filter({ hasText: GOOGLE_PATIENT.name });
  await expect(card).toContainText("10:00");
  await expect(card.getByTestId("google-pending")).toBeVisible();

  await page.goto(`${practicePath}/pendencias?motivo=google`);
  const row = shown(page.getByTestId("pending-row")).filter({ hasText: GOOGLE_PATIENT.name }).filter({ hasText: "Mudança no Google" });
  await expect(row).toContainText("11:00–11:30");
  await row.getByRole("button", { name: "Aceitar" }).click();
  await expect(row).toHaveCount(0);

  await page.goto(`${practicePath}/agendamentos/${GOOGLE_APPOINTMENT_ID}`);
  await expect(shown(page.getByTestId("status")).first()).toHaveText("Reagendado");
  await expect(shown(page.getByText(/Remarcado para .* às 11:00/))).toBeVisible();

  // The new appointment goes to Google and its event stays where the professional put it.
  google("sincronizar");
  await page.goto(`${practicePath}?visao=dia&data=${fortalezaDay(2)}`);
  const moved = shown(page.getByTestId("appointment-card")).filter({ hasText: GOOGLE_PATIENT.name }).filter({ hasText: "11:00" });
  await expect(moved).toHaveCount(1);
  await expect(moved.getByTestId("google-pending")).toHaveCount(0);
});
