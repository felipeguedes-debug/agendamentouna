import { createHmac } from "node:crypto";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_PASSWORD, TWO_FACTOR_MANAGER_EMAIL, TWO_FACTOR_SECRETARY_EMAIL, TWO_FACTOR_SECRETARY_NAME } from "./data";

// "Exigir 2FA" of Configurações da conta (PRD 11; D-16, D-36, D-71): the screen warns
// the manager who has not set it up, switching it on takes whoever is missing to the
// security page on every page, and switching it off lets them through again.

// With cacheComponents, Next keeps the previous page of a client navigation in the
// DOM, hidden, so a locator may match both. Tests look only at what is on screen.
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

/** The code an authenticator app shows now (RFC 6238), from the key the security page prints in base32. */
function authenticatorCode(key: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...key.replace(/=+$/, "").toUpperCase()].map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0")).join("");
  const secret = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", secret).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const SECURITY = /\/seguranca$/;

test("the manager is warned, requires two-factor, and whoever is missing goes to the security page", async ({ page, browser, baseURL }) => {
  const practicePath = await signIn(page, TWO_FACTOR_MANAGER_EMAIL);
  const settings = `${practicePath}/integracoes`;

  // The warning is on the screen before anything changes, for the manager too.
  await page.goto(settings);
  const section = shown(page.getByRole("region", { name: "Verificação em duas etapas" }));
  const status = section.getByTestId("two-factor-status");
  await expect(status).toHaveText("Não exigida");
  await expect(section).toContainText("Você ainda não ativou");
  await expect(section).toContainText("em toda página");
  await expect(section).toContainText(TWO_FACTOR_SECRETARY_NAME);
  await expect(section.getByRole("link", { name: "Segurança" })).toHaveAttribute("href", "/seguranca");

  // The confirmation says it again, and giving up changes nothing.
  const switchOn = section.getByRole("button", { name: "Exigir verificação em duas etapas" });
  let question = "";
  page.once("dialog", (dialog) => {
    question = dialog.message();
    return dialog.dismiss();
  });
  await switchOn.click();
  await expect.poll(() => question).toContain("Você ainda não ativou");
  await expect(status).toHaveText("Não exigida");

  // A secretary at work, before the change.
  const secretaryContext = await browser.newContext({ baseURL, locale: "pt-BR", timezoneId: "America/Fortaleza" });
  const secretary = await secretaryContext.newPage();
  await signIn(secretary, TWO_FACTOR_SECRETARY_EMAIL);

  // Switching on takes the manager straight to the security page, with no way around it.
  page.once("dialog", (dialog) => dialog.accept());
  await switchOn.click();
  await expect(page).toHaveURL(SECURITY);
  await expect(shown(page.getByText("Uma das contas em que você trabalha exige verificação em duas etapas"))).toBeVisible();
  await page.goto(practicePath);
  await expect(page).toHaveURL(SECURITY);
  await page.goto(settings);
  await expect(page).toHaveURL(SECURITY);

  // The secretary's next page goes there too, without a new sign-in.
  await secretary.goto(practicePath);
  await expect(secretary).toHaveURL(SECURITY);

  // Setting it up opens the screens again, for the manager only.
  await shown(page.getByLabel("Senha atual")).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Configurar verificação em duas etapas" }).click();
  const key = await shown(page.locator("code")).innerText();
  await shown(page.getByLabel("Código do aplicativo")).fill(authenticatorCode(key));
  await page.getByRole("button", { name: "Ativar", exact: true }).click();
  await expect(shown(page.getByText("A verificação em duas etapas está ativada."))).toBeVisible();

  await page.goto(settings);
  await expect(page).toHaveURL(new RegExp(`${settings}$`));
  await expect(status).toHaveText("Exigida");
  await expect(section).not.toContainText("Você ainda não ativou");
  await expect(section).toContainText(TWO_FACTOR_SECRETARY_NAME);
  await secretary.goto(practicePath);
  await expect(secretary).toHaveURL(SECURITY);

  // Switching off lets the secretary back, and the manager's setup stays.
  page.once("dialog", (dialog) => dialog.accept());
  await section.getByRole("button", { name: "Deixar de exigir" }).click();
  await expect(status).toHaveText("Não exigida");
  await secretary.goto(practicePath);
  await expect(secretary).toHaveURL(new RegExp(`${practicePath}$`));
  await page.goto("/seguranca");
  await expect(shown(page.getByText("A verificação em duas etapas está ativada."))).toBeVisible();

  await secretaryContext.close();
});
