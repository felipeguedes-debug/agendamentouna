import { execFileSync } from "node:child_process";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { CRM_APPOINTMENT_ID, CRM_MANAGER_EMAIL, CRM_PATIENT, CRM_SECRETARY_EMAIL, CRM_TOKEN, E2E_PASSWORD } from "./data";

// Block 7 (PRD 12): done criterion — a confirmation made in the CRM stops the cadence.
// The manager connects the practice on the screen; the secretary's side in the CRM is
// played by scripts/crm-sandbox.ts against the fake CRM of the test database, and the
// event reaches the app through the real webhook route.

// Tests look only at what is on screen.
const shown = (locator: Locator) => locator.filter({ visible: true });

/** Runs `npm run crm:sandbox -- <args>` on the test database. */
function crm(...args: string[]) {
  const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  return execFileSync(process.execPath, [tsx, path.join("scripts", "crm-sandbox.ts"), ...args], {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST, CRM_PROVIDER: "sandbox" },
    encoding: "utf8",
  });
}

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

test("the manager connects the CRM, and a confirmation made there stops the cadence", async ({ page }) => {
  const practicePath = await signIn(page, CRM_MANAGER_EMAIL);

  // The token goes in and does not come back.
  await page.goto(`${practicePath}/integracoes`);
  await expect(shown(page.getByTestId("crm-status"))).toHaveText("Não conectada");
  await shown(page.getByLabel("Token do FlwChat")).fill(CRM_TOKEN);
  await page.getByRole("button", { name: "Salvar token" }).click();
  await expect(shown(page.getByTestId("crm-status"))).toHaveText("Conectada");
  await expect(shown(page.getByTestId("crm-webhook"))).toHaveText("Recebidas pelo webhook");
  expect(await page.content()).not.toContain(CRM_TOKEN);

  // The future appointment goes to the conversation, by its display name.
  crm("sincronizar");
  let contact = crm("listar", "--celular", CRM_PATIENT.phone);
  expect(contact).toContain("Etiquetas: Agenda: Agendado");
  expect(contact).toContain("Agenda: Agendado · Procedimento");
  expect(contact).not.toContain("Vasectomia");
  expect(contact).not.toContain("não sai do sistema");

  // The secretary tags the contact in the CRM, and FlwChat posts the event.
  const answer = crm("etiqueta", "--celular", CRM_PATIENT.phone, "--etiqueta", "Confirmar na agenda");
  expect(answer).toContain("200");

  await page.goto(`${practicePath}/agendamentos/${CRM_APPOINTMENT_ID}?aba=historico`);
  await expect(shown(page.getByTestId("status")).first()).toHaveText("Confirmado");
  await expect(shown(page.getByText("SynkronosCRM")).first()).toBeVisible();
  await page.goto(`${practicePath}/agendamentos/${CRM_APPOINTMENT_ID}?aba=mensagens`);
  // The confirmation request still to go was canceled by the status table.
  await expect(shown(page.getByTestId("dispatch-log"))).toContainText("agendamento confirmado");

  // The command came off the contact, and the status tag follows.
  crm("sincronizar");
  contact = crm("listar", "--celular", CRM_PATIENT.phone);
  expect(contact).toContain("Etiquetas: Agenda: Confirmado");
  expect(contact).not.toContain("Confirmar na agenda");
  expect(contact).toContain("Agenda: Confirmado · Procedimento");

  // The manager sees what happened.
  await page.goto(`${practicePath}/integracoes`);
  await expect(shown(page.getByTestId("crm-event")).first()).toContainText("Confirmado");
  await expect(shown(page.getByTestId("crm-event")).first()).toContainText(CRM_PATIENT.name);
});

test("the settings screen is the manager's", async ({ page }) => {
  const practicePath = await signIn(page, CRM_SECRETARY_EMAIL);
  await expect(shown(page.getByRole("link", { name: "Segurança e integrações" }))).toHaveCount(0);
  await page.goto(`${practicePath}/integracoes`);
  await expect(shown(page.getByRole("heading", { name: "Sem permissão" }))).toBeVisible();
});
