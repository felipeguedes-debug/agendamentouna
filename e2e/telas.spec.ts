import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_PASSWORD, fortalezaDay, MANAGER_EMAIL, SECRETARY_EMAIL } from "./data";

// The lighter screens (D-81 to D-89): the side menu, the panels over the agenda, the
// blocks, the locations and working hours, the audit trail and the forgotten password.

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

test("the side menu has the daily work, the settings by group and the user's menu", async ({ page }) => {
  await signIn(page, MANAGER_EMAIL);
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  for (const name of ["Agenda", "Pendências", "Pacientes", "Indicadores"]) await expect(menu.getByRole("link", { name })).toBeVisible();
  await menu.getByRole("button", { name: "Configurações" }).click();
  for (const name of ["Tipos de atendimento", "Régua de WhatsApp", "Profissionais", "Usuários", "Unidades e horários", "Segurança e integrações", "Trilha de auditoria"]) {
    await expect(page.getByRole("menuitem", { name })).toBeVisible();
  }
  await page.getByRole("menuitem", { name: "Ver todas" }).click();
  await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Trilha de auditoria/ })).toBeVisible();

  await page.getByRole("button", { name: /^Menu de / }).click();
  await expect(page.getByRole("menuitem", { name: "Segurança" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Sair" })).toBeVisible();
});

// D-79: only the server's answer ends the session. The new ways out say so as well.
test("when signing out does not reach the server, the user's menu and Mais say so and stay", async ({ page, context }) => {
  const practicePath = await signIn(page, SECRETARY_EMAIL);
  const sessionCookie = async () => (await context.cookies()).find((cookie) => cookie.name.includes("session_token"));
  const refusal = page.getByRole("alert").filter({ hasText: "Não foi possível sair" });
  const signOutUrl = "**/api/auth/sign-out";

  await page.route(signOutUrl, (route) => route.fulfill({ status: 500, contentType: "application/json", body: "{}" }));
  await page.getByRole("button", { name: /^Menu de / }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(refusal).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(practicePath);
  expect(await sessionCookie()).toBeDefined();
  await page.keyboard.press("Escape");

  await page.goto(`${practicePath}/mais`);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(refusal).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`${practicePath}/mais`);
  expect(await sessionCookie()).toBeDefined();

  // With the server answering, the menu leaves for real.
  await page.unroute(signOutUrl);
  await page.goto(practicePath);
  await page.getByRole("button", { name: /^Menu de / }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await sessionCookie()).toBeUndefined();
});

test("opening the week does not send a request for each card and free slot (D-82)", async ({ page }) => {
  const practicePath = await signIn(page, SECRETARY_EMAIL);
  const prefetches: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("_rsc=")) prefetches.push(request.url());
  });
  await page.goto(practicePath);
  await expect(page.getByRole("region", { name: "Grade da agenda" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  // The bars keep their single links; what must not prefetch are the dozens in the grid.
  expect(prefetches.filter((url) => /novo\?data=|bloqueioHora=|agendamento=/.test(url))).toEqual([]);
});

test("the search on the top bar opens a patient from any screen", async ({ page }) => {
  await signIn(page, SECRETARY_EMAIL);
  await page.getByRole("searchbox", { name: "Buscar paciente" }).fill("Maria Souza");
  await page.getByRole("link", { name: /Maria Souza E2E/ }).click();
  await expect(page.getByRole("heading", { name: "Maria Souza E2E" })).toBeVisible();
});

test("an appointment opens over the agenda and closing keeps the view", async ({ page }) => {
  const day = fortalezaDay(4);
  const practicePath = await signIn(page, SECRETARY_EMAIL);
  await page.goto(`${practicePath}/agendamentos/novo?data=${day}&hora=15:00`);
  await shown(page.getByLabel("Paciente", { exact: true })).fill("Maria Souza");
  await page.getByRole("option", { name: /Maria Souza E2E/ }).click();
  await shown(page.locator("label", { hasText: "Primeira consulta" })).click();
  await page.getByRole("button", { name: "Salvar agendamento" }).click();
  await expect(page.getByRole("dialog")).toContainText("Maria Souza E2E");

  await page.goto(`${practicePath}?visao=dia&data=${day}`);
  await shown(page.getByTestId("appointment-card")).filter({ hasText: "Maria Souza E2E" }).click();
  await expect(page).toHaveURL(new RegExp(`visao=dia&data=${day}&agendamento=[0-9a-f-]{36}$`));
  await page.getByRole("link", { name: "Fechar" }).click();
  await expect(page).toHaveURL(new RegExp(`\\?visao=dia&data=${day}$`));
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const missing = await page.goto(`${practicePath}?agendamento=00000000-0000-4000-8000-000000000000`);
  expect(missing?.status()).toBe(404);
});

test("the secretary blocks a time, sees the warning over an appointment, and removes the block", async ({ page }) => {
  const day = fortalezaDay(5);
  const practicePath = await signIn(page, SECRETARY_EMAIL);
  await page.goto(`${practicePath}/agendamentos/novo?data=${day}&hora=16:00`);
  await shown(page.getByLabel("Paciente", { exact: true })).fill("Maria Souza");
  await page.getByRole("option", { name: /Maria Souza E2E/ }).click();
  await shown(page.locator("label", { hasText: "Primeira consulta" })).click();
  await page.getByRole("button", { name: "Salvar agendamento" }).click();
  await expect(page.getByRole("dialog")).toContainText("Maria Souza E2E");

  await page.goto(`${practicePath}?visao=dia&data=${day}`);
  await page.getByRole("link", { name: "Bloquear", exact: true }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByRole("heading", { name: "Bloquear horário" })).toBeVisible();
  await panel.getByLabel("Início").fill("15:00");
  await panel.getByLabel("Fim").fill("17:00");
  await expect(panel.getByTestId("block-conflicts")).toContainText("Maria Souza E2E");
  await panel.getByLabel("Motivo").fill("Reunião da clínica");
  await panel.getByRole("button", { name: "Salvar bloqueio" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const card = shown(page.getByTestId("block-card")).filter({ hasText: "Reunião da clínica" });
  await expect(card).toContainText("15:00 às 17:00");
  // The appointment is still there: a block warns and cancels nothing.
  await expect(shown(page.getByTestId("appointment-card")).filter({ hasText: "Maria Souza E2E" })).toHaveCount(1);

  await card.click();
  await page.getByRole("dialog").getByRole("button", { name: "Remover bloqueio" }).click();
  await expect(shown(page.getByTestId("block-card"))).toHaveCount(0);
});

test("the secretary adds a patient and goes straight to booking", async ({ page }) => {
  const practicePath = await signIn(page, SECRETARY_EMAIL);
  await page.goto(`${practicePath}/pacientes`);
  await page.getByRole("link", { name: "Adicionar paciente" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Nome completo").fill("Renata Cadastro E2E");
  await panel.getByLabel("Celular").fill("(85) 99777-0090");
  await panel.getByLabel("Aceita receber lembretes pelo WhatsApp").check();
  await panel.getByRole("button", { name: "Salvar e agendar" }).click();
  await expect(page.getByRole("heading", { name: "Novo agendamento" })).toBeVisible();
  await expect(shown(page.getByTestId("selected-patient"))).toHaveText("Renata Cadastro E2E");

  await page.goto(`${practicePath}/pacientes`);
  await shown(page.getByLabel("Buscar na lista")).fill("renata cadastro");
  await expect(shown(page.getByTestId("patients-total"))).toHaveText('1 encontrado para "renata cadastro"');
  await expect(page).toHaveURL(/busca=renata/);
  await page.getByRole("link", { name: "Adicionar paciente" }).click();
  const again = page.getByRole("dialog");
  await again.getByLabel("Nome completo").fill("Outra Pessoa");
  await again.getByLabel("Celular").fill("(85) 99777-0090");
  await again.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(again.getByRole("link", { name: "Abrir Renata Cadastro E2E" })).toBeVisible();
});

test("the manager keeps locations, working hours and days off, and the audit trail shows it", async ({ page }) => {
  const practicePath = await signIn(page, MANAGER_EMAIL);
  await page.goto(`${practicePath}/unidades`);
  await page.getByRole("link", { name: "Adicionar unidade" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Nome").fill("Unidade Nova E2E");
  await panel.getByLabel("Endereço").fill("Rua Exemplo, 77");
  await panel.getByRole("button", { name: "Salvar" }).click();
  await expect(shown(page.getByTestId("location-row")).filter({ hasText: "Unidade Nova E2E" })).toContainText("Nenhum profissional ainda");

  await page.getByRole("link", { name: "Horários e exceções" }).click();
  await page.getByRole("button", { name: "Adicionar intervalo em Sábado" }).click();
  const interval = page.getByRole("group", { name: "Intervalo de Sábado" });
  // The professional of the e2e data already works from 07:00 to 19:00, every day.
  await interval.getByLabel("Início").fill("19:00");
  await interval.getByLabel("Fim").fill("20:00");
  await interval.getByLabel("Unidade").selectOption({ label: "Unidade Nova E2E" });
  await interval.getByRole("button", { name: "Salvar" }).click();
  const saturday = shown(page.getByTestId("weekday-row")).filter({ hasText: "Sábado" });
  await expect(saturday).toContainText("19:00 às 20:00");
  await expect(saturday).toContainText("Unidade Nova E2E");

  await page.getByLabel("De", { exact: true }).fill(fortalezaDay(30));
  await page.getByLabel("Motivo").fill("Congresso");
  await page.getByRole("button", { name: "Adicionar exceção" }).click();
  await expect(shown(page.getByTestId("exception-row")).filter({ hasText: "Congresso" })).toBeVisible();

  // The location now lists who works there.
  await page.goto(`${practicePath}/unidades`);
  await expect(shown(page.getByTestId("location-row")).filter({ hasText: "Unidade Nova E2E" })).not.toContainText("Nenhum profissional ainda");

  await page.goto(`${practicePath}/auditoria`);
  await page.getByLabel("Área").selectOption({ label: "Unidades e horários" });
  await expect(page).toHaveURL(/area=consultorio/);
  const rows = shown(page.getByTestId("audit-row"));
  await expect(rows.filter({ hasText: "Criou uma unidade" })).toContainText("Unidade Nova E2E");
  await expect(rows.filter({ hasText: "Adicionou um horário de atendimento" })).toContainText("início, fim");
  await expect(rows.filter({ hasText: "Adicionou uma exceção de horário" })).not.toContainText("Congresso");
});

test("the manager adds a professional, moves them between locations and takes them off", async ({ page }) => {
  const practicePath = await signIn(page, MANAGER_EMAIL);
  await page.goto(`${practicePath}/unidades?unidade=nova`);
  const unit = page.getByRole("dialog");
  await unit.getByLabel("Nome").fill("Unidade Equipe E2E");
  await unit.getByLabel("Endereço").fill("Rua Equipe, 1");
  await unit.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto(`${practicePath}/profissionais`);
  await page.getByRole("link", { name: "Adicionar profissional" }).click();
  const panel = page.getByRole("dialog");
  await panel.getByRole("button", { name: "Salvar" }).click();
  await expect(panel.getByRole("alert")).toContainText("Informe o nome");
  await panel.getByLabel("Nome").fill("Dra. Nova E2E");
  await panel.getByLabel("Unidade Centro").check();
  await panel.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("heading", { name: /Dra\. Nova E2E/ })).toBeVisible();
  await expect(page.getByTestId("professional-login")).toContainText("Sem login");

  // The booking form now offers her.
  const profile = page.url();
  await page.goto(`${practicePath}/agendamentos/novo`);
  await expect(shown(page.getByLabel("Profissional")).getByRole("option", { name: "Dra. Nova E2E" })).toHaveCount(1);

  // A second location, then back: she always keeps one.
  await page.goto(profile);
  const rowOf = (name: string) => shown(page.getByTestId("professional-location")).filter({ hasText: name });
  await page.getByRole("button", { name: "Ligar a Unidade Equipe E2E" }).click();
  await expect(rowOf("Unidade Equipe E2E")).toContainText("Atende aqui");
  await page.getByRole("button", { name: "Desligar de Unidade Centro" }).click();
  await expect(rowOf("Unidade Centro")).toContainText("Não atende");
  await page.getByRole("button", { name: "Desligar de Unidade Equipe E2E" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "precisa de pelo menos uma unidade" })).toBeVisible();

  // Taken off, she leaves the booking form and stays on the list, to come back.
  await page.getByRole("button", { name: "Desativar profissional" }).click();
  await expect(page.getByRole("button", { name: "Reativar profissional" })).toBeVisible();
  await page.goto(`${practicePath}/agendamentos/novo`);
  await expect(shown(page.getByLabel("Profissional")).getByRole("option", { name: "Dra. Nova E2E" })).toHaveCount(0);
  await page.goto(`${practicePath}/profissionais`);
  await expect(shown(page.getByTestId("professional-row")).filter({ hasText: "Dra. Nova E2E" })).toContainText("Inativo");
});

test("the forgotten password answers the same with or without an account", async ({ page }) => {
  const answer = "Se houver uma conta com esse e-mail";
  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page.getByRole("heading", { name: "Esqueci minha senha" })).toBeVisible();
  await page.getByLabel("E-mail").fill("ninguem.e2e@example.com");
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("status")).toContainText(answer);
  await page.getByRole("button", { name: "Enviar de novo" }).click();
  await page.getByLabel("E-mail").fill(SECRETARY_EMAIL);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByRole("status")).toContainText(answer);

  await page.goto("/nova-senha?error=INVALID_TOKEN");
  await expect(page.getByRole("heading", { name: "Este link não vale mais" })).toBeVisible();
  await page.getByRole("link", { name: "Pedir outro link" }).click();
  await expect(page.getByRole("heading", { name: "Esqueci minha senha" })).toBeVisible();
});
