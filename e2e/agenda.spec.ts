import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_PASSWORD, fortalezaDay, PROFESSIONAL_NAME, SECRETARY_EMAIL, TYPE_NAME } from "./data";

// Done criterion of Block 3 (PRD 12): book, confirm, reschedule and cancel, as the
// secretary, through the screens. Rescheduling creates a new appointment linked to
// the original, which becomes Reagendado (D-11).

const PATIENT = "Joana E2E";

// Tests look only at what is on screen.
const shown = (locator: Locator) => locator.filter({ visible: true });

async function signIn(page: Page) {
  await page.goto("/login");
  await shown(page.getByLabel("E-mail")).fill(SECRETARY_EMAIL);
  await shown(page.getByLabel("Senha")).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/conta\/[0-9a-f-]{36}$/);
}

test("the secretary books, confirms, reschedules and cancels an appointment", async ({ page }) => {
  const firstDay = fortalezaDay(1);
  const newDay = fortalezaDay(2);
  await signIn(page);
  const agendaUrl = page.url();

  // Book, registering the patient inline (D-22).
  await page.getByRole("link", { name: "Agendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Novo agendamento" })).toBeVisible();
  await shown(page.getByLabel("Paciente", { exact: true })).fill(PATIENT);
  await page.getByRole("button", { name: `+ Cadastrar novo paciente "${PATIENT}"` }).click();
  await expect(shown(page.getByLabel("Nome do paciente"))).toHaveValue(PATIENT);
  await shown(page.getByLabel("Celular")).fill("(85) 99123-4567");
  // Consent collected at registration (D-47).
  await shown(page.getByLabel("Aceita receber lembretes pelo WhatsApp")).check();
  await shown(page.getByLabel("Como aceitou")).selectOption({ label: "Telefone" });
  await page.getByRole("button", { name: "Cadastrar paciente" }).click();
  await expect(shown(page.getByTestId("selected-patient"))).toHaveText(PATIENT);

  await expect(shown(page.getByLabel("Profissional"))).toHaveValue(/.+/);
  await shown(page.locator("label", { hasText: TYPE_NAME })).click();
  await expect(shown(page.getByText(/R\$ 450/))).toBeVisible();
  await shown(page.getByLabel("Data", { exact: true })).fill(firstDay);
  await shown(page.getByLabel("Hora", { exact: true })).fill("09:00");
  await page.getByRole("button", { name: "Salvar agendamento" }).click();

  // The appointment opens over the agenda, on its day (D-83).
  await expect(page).toHaveURL(new RegExp(`data=${firstDay}&agendamento=[0-9a-f-]{36}$`));
  const originalUrl = page.url();
  await expect(page.getByRole("dialog")).toContainText(PATIENT);
  await expect(shown(page.getByTestId("status"))).toHaveText("Agendado");
  await expect(shown(page.getByText(`09:00 às 09:30 · ${PROFESSIONAL_NAME}`))).toBeVisible();

  // Confirm.
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(shown(page.getByTestId("status"))).toHaveText("Confirmado");
  await page.getByRole("link", { name: /^Histórico/ }).click();
  await expect(shown(page.getByTestId("history"))).toContainText("Agendado → Confirmado");
  await expect(shown(page.getByTestId("history"))).toContainText("Secretária E2E");

  // Reschedule: a new appointment, linked to the original.
  await page.getByRole("button", { name: "Remarcar", exact: true }).click();
  await shown(page.getByLabel("Nova data")).fill(newDay);
  await shown(page.getByLabel("Nova hora")).fill("10:30");
  await page.getByRole("form", { name: "Remarcar" }).getByRole("button", { name: "Remarcar" }).click();
  await expect(page).toHaveURL(new RegExp(`data=${newDay}&agendamento=[0-9a-f-]{36}$`));
  const newUrl = page.url();
  await expect(shown(page.getByTestId("status"))).toHaveText("Agendado");
  await expect(shown(page.getByText(/Remarcado de/))).toBeVisible();
  await expect(shown(page.getByText(`10:30 às 11:00 · ${PROFESSIONAL_NAME}`))).toBeVisible();

  // The original keeps its history and has no way out of Reagendado.
  await page.goto(`${originalUrl}&aba=historico`);
  await expect(shown(page.getByTestId("status"))).toHaveText("Reagendado");
  await expect(shown(page.getByTestId("history"))).toContainText("Confirmado → Reagendado");
  await expect(shown(page.getByText(/Remarcado para/))).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remarcar", exact: true })).toHaveCount(0);

  // Cancel the new one, with a reason.
  await page.goto(newUrl);
  await page.getByRole("button", { name: "Mais ações" }).click();
  await page.getByRole("menuitem", { name: "Cancelar pelo paciente" }).click();
  await shown(page.getByLabel("Motivo do cancelamento (opcional)")).fill("Paciente viajou");
  await page.getByRole("button", { name: "Confirmar: cancelar pelo paciente" }).click();
  await expect(shown(page.getByTestId("status"))).toHaveText("Cancelado pelo paciente");
  await page.getByRole("link", { name: /^Histórico/ }).click();
  await expect(shown(page.getByTestId("history"))).toContainText("Agendado → Cancelado pelo paciente");
  await expect(shown(page.getByTestId("history"))).toContainText("Motivo: Paciente viajou");

  // The day list shows it canceled and the value panel leaves it out (D-13).
  await page.goto(`${agendaUrl}?visao=lista&data=${newDay}`);
  const row = page.getByTestId("day-list-item").filter({ hasText: PATIENT });
  await expect(row).toContainText("Cancelado pelo paciente");
  await expect(shown(page.getByLabel("Resumo do período"))).toContainText("R$ 0 previsto");

  // The patient's page lists both appointments and the consent given at registration.
  await page.goto(newUrl);
  await page.getByRole("link", { name: "Ver todos os agendamentos" }).click();
  await expect(shown(page.getByTestId("consent"))).toHaveText("Aceita WhatsApp");
  await expect(shown(page.getByTestId("patient-appointment"))).toHaveCount(2);
});

test("the day list confirms and closes an appointment in one click", async ({ page }) => {
  const day = fortalezaDay(3);
  await signIn(page);
  const agendaUrl = page.url();

  await page.goto(`${agendaUrl}/agendamentos/novo?data=${day}`);
  await shown(page.getByLabel("Paciente", { exact: true })).fill("Maria Souza");
  await page.getByRole("option", { name: /Maria Souza E2E/ }).click();
  await shown(page.locator("label", { hasText: TYPE_NAME })).click();
  await shown(page.getByLabel("Hora", { exact: true })).fill("14:00");
  await page.getByRole("button", { name: "Salvar agendamento" }).click();
  await expect(shown(page.getByTestId("status"))).toHaveText("Agendado");

  await page.goto(`${agendaUrl}?visao=lista&data=${day}`);
  const row = page.getByTestId("day-list-item").filter({ hasText: "Maria Souza E2E" });
  await row.getByRole("button", { name: "Confirmar" }).click();
  await expect(shown(row.getByTestId("status"))).toHaveText("Confirmado");
  await row.getByRole("button", { name: "Chegou" }).click();
  await expect(shown(row.getByTestId("status"))).toHaveText("Chegou");
  // The next step on the row; the others in its menu (D-82).
  await row.getByRole("button", { name: "Mais ações" }).click();
  await page.getByRole("menuitem", { name: "Atendido" }).click();
  await expect(shown(row.getByTestId("status"))).toHaveText("Atendido");
  await expect(shown(page.getByLabel("Resumo do período"))).toContainText("R$ 450");
});
