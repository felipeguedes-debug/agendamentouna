import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { Client } from "pg";

// The way into an empty database (D-93 and D-94): the operator's command creates the
// organization, the practice and the invitation; the first admin takes it from there, up
// to the WhatsApp instance of the first professional. Only the invitation link comes from
// the command's output, as in a real first deploy without e-mail.

function createAccount(baseURL: string, ...args: string[]) {
  const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  return execFileSync(process.execPath, [tsx, path.join("scripts", "create-account.ts"), ...args], {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST, DIRECT_URL: "", EMAIL_PROVIDER: "console", BETTER_AUTH_URL: baseURL },
    encoding: "utf8",
  });
}

test("the first admin comes in by the command's invitation and registers a professional's WhatsApp", async ({ page, baseURL }) => {
  const tag = randomUUID().slice(0, 8);
  const email = `primeiro-admin-${tag}@example.com`;
  const practice = `Primeira conta ${tag}`;
  const token = `token-da-instancia-${tag}`;

  const output = createAccount(baseURL!, "--organizacao", `Organização ${tag}`, "--conta", practice, "--unidade", "Unidade Centro", "--endereco", "Av. Teste, 100", "--email", email);
  const link = /https?:\/\/\S+\/convite\/[\w-]+/.exec(output)?.[0];
  expect(link).toBeTruthy();
  // A second time with the same organization is refused, and leaves no twin.
  expect(() => createAccount(baseURL!, "--organizacao", `Organização ${tag}`, "--conta", practice, "--unidade", "X", "--endereco", "Y", "--email", email)).toThrow();

  await page.goto(link!);
  await expect(page.getByText("Admin da organização")).toBeVisible();
  await page.getByLabel("Seu nome").fill("Primeira Pessoa");
  await page.getByLabel("Senha", { exact: true }).fill("senha-da-primeira-pessoa");
  await page.getByLabel("Repita a senha").fill("senha-da-primeira-pessoa");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar acesso" }).click();
  await expect(page).toHaveURL(/\/conta\/[0-9a-f-]{36}/);
  const practicePath = new URL(page.url()).pathname;

  // The table by practice is the admin's: the invitation gave more than a manager has.
  await page.goto(`${practicePath}/saude`);
  await expect(page.getByRole("heading", { name: "Por conta da organização" })).toBeVisible();
  await expect(page.getByRole("link", { name: practice })).toBeVisible();

  await page.goto(`${practicePath}/profissionais?novo=1`);
  await page.getByLabel("Nome").fill("Dra. Primeira");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/profissionais\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("whatsapp-status")).toHaveText("Sem instância");

  await page.getByLabel("URL da instância").fill("https://exemplo.uazapi.com");
  await page.getByLabel("Token da instância").fill(token);
  await page.getByLabel("Número conectado").fill("85 99988-7766");
  await page.getByRole("button", { name: "Salvar instância" }).click();
  await expect(page.getByText("Instância salva.")).toBeVisible();
  await expect(page.getByTestId("whatsapp-status")).toContainText("aguardando QR Code");

  // Back from the server: the address and the number show, and the token never does.
  await page.reload();
  await expect(page.getByLabel("URL da instância")).toHaveValue("https://exemplo.uazapi.com");
  await expect(page.getByLabel("Token da instância")).toHaveValue("");
  await expect(page.getByLabel("Número conectado")).toHaveValue("(85) 99988-7766");
  expect(await page.content()).not.toContain(token);

  await page.goto(`${practicePath}/auditoria`);
  await expect(page.getByText("Registrou a instância de WhatsApp")).toBeVisible();
  await expect(page.getByText("Passou a administrar a organização")).toBeVisible();
});

test("an error on a practice's screen goes on its panel, without the text (D-101)", async ({ page, baseURL }) => {
  const tag = randomUUID().slice(0, 8);
  const output = createAccount(baseURL!, "--organizacao", `Organização ${tag}`, "--conta", `Conta ${tag}`, "--unidade", "Centro", "--endereco", "Av. Teste, 100", "--email", `admin-${tag}@example.com`);
  const practiceId = /Conta: ([0-9a-f-]{36})/.exec(output)![1];
  await page.goto(/https?:\/\/\S+\/convite\/[\w-]+/.exec(output)![0]);
  await page.getByLabel("Seu nome").fill("Pessoa");
  await page.getByLabel("Senha", { exact: true }).fill("senha-da-terceira-pessoa");
  await page.getByLabel("Repita a senha").fill("senha-da-terceira-pessoa");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar acesso" }).click();
  await expect(page).toHaveURL(/\/conta\/[0-9a-f-]{36}/);

  // A time zone Intl does not know makes the agenda throw: a real error, in the real build.
  const pg = new Client({ connectionString: process.env.DATABASE_URL_TEST });
  await pg.connect();
  try {
    await pg.query(`UPDATE "Location" SET "timeZone" = 'Marte/Olympus' WHERE "practiceId" = $1`, [practiceId]);
    const broken = await page.goto(`/conta/${practiceId}`);
    expect(broken?.status()).toBe(500);
    await pg.query(`UPDATE "Location" SET "timeZone" = 'America/Fortaleza' WHERE "practiceId" = $1`, [practiceId]);
    const { rows } = await pg.query<{ source: string; route: string; errorName: string; digest: string | null }>(`SELECT source, route, "errorName", digest FROM "ServerError" WHERE "practiceId" = $1`, [practiceId]);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].route).toContain("conta/[practiceId]");
    expect(JSON.stringify(rows)).not.toContain("Marte");
  } finally {
    await pg.end();
  }

  await page.goto(`/conta/${practiceId}/saude`);
  await expect(page.getByRole("heading", { name: "Erros do sistema" })).toBeVisible();
  await expect(page.locator("main").getByRole("cell", { name: /conta\/\[practiceId\]/ }).first()).toBeVisible();
});

test("a bad instance address is refused on the screen, with nothing saved", async ({ page, baseURL }) => {
  const tag = randomUUID().slice(0, 8);
  const output = createAccount(baseURL!, "--organizacao", `Organização ${tag}`, "--conta", `Conta ${tag}`, "--unidade", "Centro", "--endereco", "Av. Teste, 100", "--email", `admin-${tag}@example.com`);
  await page.goto(/https?:\/\/\S+\/convite\/[\w-]+/.exec(output)![0]);
  await page.getByLabel("Seu nome").fill("Pessoa");
  await page.getByLabel("Senha", { exact: true }).fill("senha-da-segunda-pessoa");
  await page.getByLabel("Repita a senha").fill("senha-da-segunda-pessoa");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Criar acesso" }).click();
  await expect(page).toHaveURL(/\/conta\/[0-9a-f-]{36}/);

  await page.goto(`${new URL(page.url()).pathname}/profissionais?novo=1`);
  await page.getByLabel("Nome").fill("Dr. Segundo");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page).toHaveURL(/\/profissionais\/[0-9a-f-]{36}$/);

  await page.getByLabel("URL da instância").fill("https://169.254.169.254");
  await page.getByLabel("Token da instância").fill("qualquer");
  await page.getByLabel("Número conectado").fill("85 99988-7766");
  await page.getByRole("button", { name: "Salvar instância" }).click();
  await expect(page.getByText("começando por https://")).toBeVisible();
  await expect(page.getByTestId("whatsapp-status")).toHaveText("Sem instância");
});
