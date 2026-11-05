import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  CONFIRMING_APPOINTMENT_ID,
  CONFIRMING_PATIENT,
  E2E_PASSWORD,
  INSTANCE_ID,
  INSTANCE_TOKEN,
  MANAGER_EMAIL,
  SECRETARY_EMAIL,
  UNCONFIRMED_PATIENT,
} from "./data";

// Block 5 (PRD 12): done criterion — in the test environment, a WhatsAPI webhook
// with the answer "1" turns the appointment Confirmado within 10 s and ends the
// confirmation requests. Also the cadence editor with its preview and the
// "Sem confirmação" work list.

// Tests look only at what is on screen.
const shown = (locator: Locator) => locator.filter({ visible: true });

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

test("a reply 1 through the WhatsAPI webhook confirms within 10 s and ends the confirmation requests", async ({ page, request }) => {
  const practicePath = await signIn(page, SECRETARY_EMAIL);
  const detail = `${practicePath}/agendamentos/${CONFIRMING_APPOINTMENT_ID}`;
  await page.goto(`${detail}?aba=mensagens`);
  await expect(shown(page.getByTestId("status")).first()).toHaveText("Agendado");
  await expect(shown(page.getByTestId("dispatch-status"))).toHaveText(["Enviada", "Enviada", "Agendada"]);

  const started = Date.now();
  const response = await request.post(`/api/webhooks/whatsapi/${INSTANCE_ID}`, {
    data: {
      EventType: "messages",
      owner: "5585900000099",
      token: INSTANCE_TOKEN,
      BaseUrl: "https://whatsapi.e2e.test",
      instanceName: "Dra. Ana E2E",
      message: {
        id: "5585900000099:E2E1",
        messageid: "E2E1",
        chatid: `${CONFIRMING_PATIENT.phone.slice(1)}@s.whatsapp.net`,
        sender: `${CONFIRMING_PATIENT.phone.slice(1)}@s.whatsapp.net`,
        fromMe: false,
        isGroup: false,
        messageType: "Conversation",
        text: "1",
        messageTimestamp: Date.now(),
      },
    },
  });
  expect(response.status()).toBe(200);
  await page.goto(`${detail}?aba=mensagens`);
  await expect(shown(page.getByTestId("status")).first()).toHaveText("Confirmado");
  expect(Date.now() - started).toBeLessThan(10_000);

  // The request that got the answer is read; the H-3 request will not go out.
  await expect(shown(page.getByTestId("dispatch-status"))).toHaveText(["Enviada", "Lida", "Cancelada"]);
  await expect(shown(page.getByText("Resposta: 1"))).toBeVisible();
  await page.goto(`${detail}?aba=historico`);
  await expect(shown(page.getByText(/Paciente, pelo WhatsApp/))).toBeVisible();
});

test("a webhook without the instance token changes nothing", async ({ request }) => {
  const response = await request.post(`/api/webhooks/whatsapi/${INSTANCE_ID}`, { data: { EventType: "messages", token: "wrong", message: { text: "3" } } });
  expect(response.status()).toBe(401);
});

test("the manager adds a step to the cadence and sees the preview for next Tuesday at 10h", async ({ page }) => {
  await signIn(page, MANAGER_EMAIL);
  // The settings open from the side menu (D-81).
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("menuitem", { name: "Régua de WhatsApp" }).click();
  await expect(shown(page.getByRole("heading", { name: "Régua de WhatsApp" }))).toBeVisible();
  await expect(shown(page.getByLabel("Nome da régua"))).toHaveValue("Consulta padrão");
  await expect(shown(page.getByTestId("cadence-preview")).locator("li")).toHaveCount(3);

  await shown(page.getByRole("button", { name: /Adicionar passo/ })).click();
  const step = shown(page.getByRole("listitem", { name: "Passo 4" }));
  await step.getByLabel("Quando").selectOption("days");
  await step.getByLabel("Quantos dias antes").fill("2");
  await step.getByLabel("Ação esperada").selectOption("REMINDER");
  await step.getByLabel("Status elegível").selectOption("scheduled_confirmed");
  await step.getByLabel("Texto do passo 4").fill("{primeiro_nome}, seu {tipo} é {data_extenso} às {hora}. Até lá!");
  await shown(page.getByRole("button", { name: "Salvar régua" })).click();

  await expect(shown(page.getByText("Régua salva."))).toBeVisible();
  await expect(shown(page.getByText(/^Versão 2\./))).toBeVisible();
  await expect(shown(page.getByTestId("cadence-preview")).locator("li")).toHaveCount(4);
  await expect(shown(page.getByRole("heading", { name: /Prévia para um atendimento na próxima terça/ }))).toBeVisible();

  // An unknown variable is refused with the step and the variable named.
  await step.getByLabel("Texto do passo 4").fill("Veja {link_reagendar}");
  await shown(page.getByRole("button", { name: "Salvar régua" })).click();
  await expect(shown(page.getByText("Passo 4: variável {link_reagendar} não existe"))).toBeVisible();
});

test("the secretary confirms by phone an appointment on the Sem confirmação list", async ({ page }) => {
  await signIn(page, SECRETARY_EMAIL);
  await shown(page.getByRole("link", { name: /^Pendências/ })).click();
  await page.getByRole("link", { name: /^Sem confirmação/ }).click();
  const row = shown(page.getByTestId("pending-row")).filter({ hasText: UNCONFIRMED_PATIENT.name });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Confirmar" }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Sem confirmação/ })).toHaveText("Sem confirmação0");
});
