import { readFile } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_PASSWORD, fortalezaDay, MANAGER_EMAIL, PROFESSIONAL_NAME, SECRETARY_EMAIL, TYPE_NAME } from "./data";

// Done criterion of Block 4 (PRD 12): a 500-line spreadsheet imports with a report
// of errors by line. Then the manager turns the cadence of the imported
// appointments on (D-18), and the Pacientes screen handles consent (D-47) and the
// data subject's export and erasure (D-28, D-49).

// Tests look only at what is on screen.
const shown = (locator: Locator) => locator.filter({ visible: true });

// The second test works on what the first one imported.
test.describe.configure({ mode: "serial" });

/** See the note in e2e/google.spec.ts on the sign-in limit. */
async function signIn(page: Page, email: string) {
  for (let attempt = 1; ; attempt += 1) {
    await page.goto("/login");
    await shown(page.getByLabel("E-mail")).fill(email);
    await shown(page.getByLabel("Senha")).fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    try {
      await expect(page).toHaveURL(/\/conta\/[0-9a-f-]{36}$/);
      return;
    } catch (error) {
      if (attempt > 1 || !(await page.getByText("Muitas tentativas").isVisible())) throw error;
      await page.waitForTimeout(10_000);
    }
  }
}

function csvFile(name: string, lines: string[]) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(`﻿${lines.join("\r\n")}\r\n`, "utf8") };
}

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const SLOTS = ["08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];

/** 490 bookings from day 30 on, ten a day, for 49 patients, plus 10 broken lines. */
function agendaLines() {
  const rows: string[] = [];
  for (let index = 0; index < 490; index += 1) {
    const patient = index % 49;
    const name = patient === 0 ? "Joana Importada" : `Paciente Agenda ${patient}`;
    const phone = patient === 0 ? "85 99700-0001" : `8599710${String(patient).padStart(4, "0")}`;
    rows.push([brDate(fortalezaDay(30 + Math.floor(index / SLOTS.length))), SLOTS[index % SLOTS.length], PROFESSIONAL_NAME, "", TYPE_NAME, name, phone].join(";"));
  }
  const first = rows[0].split(";");
  const broken = [
    ...[1, 2, 3, 4].map((n) => [brDate(fortalezaDay(90)), `0${n}:00`, PROFESSIONAL_NAME, "", "Massagem", `Erro Tipo ${n}`, `859972000${n}0`]),
    ...[1, 2, 3].map((n) => ["31/02/2027", "09:00", PROFESSIONAL_NAME, "", TYPE_NAME, `Erro Data ${n}`, `859973000${n}0`]),
    ["32/13/2027", "09:00", PROFESSIONAL_NAME, "", TYPE_NAME, "Erro Data 4", "85997400040"],
    // The first line's slot, another patient: the first one wins.
    [first[0], first[1], PROFESSIONAL_NAME, "", TYPE_NAME, "Conflito Um", "85997500010"],
    [first[0], first[1], PROFESSIONAL_NAME, "", TYPE_NAME, "Conflito Dois", "85997500020"],
  ].map((cells) => cells.join(";"));
  return ["data;hora;profissional;unidade;tipo;paciente;celular", ...rows, ...broken];
}

test("the manager imports patients and a 500-line agenda, reads the error report and turns the cadence on", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, MANAGER_EMAIL);
  await page.getByRole("link", { name: "Pacientes", exact: true }).click();
  await page.getByRole("link", { name: "Importar planilha" }).click();
  await expect(page.getByRole("heading", { name: "Importar planilha" })).toBeVisible();

  // Patients: new ones, one already registered by phone, two broken lines.
  const patients = shown(page.getByRole("region", { name: "Pacientes", exact: true }));
  await patients.getByLabel("Arquivo CSV").setInputFiles(
    csvFile("pacientes.csv", [
      "nome;celular;convenio;observacoes;consentimento_whatsapp",
      "Joana Importada;85 99700-0001;Unimed;Prefere manhã;sim",
      "Paula Exclui;85 99700-0002;;;não",
      "Maria Souza de Novo;(85) 99812-4455;;;sim",
      "Sem Celular;;;;",
      "Celular Curto;1234;;;",
    ]),
  );
  await patients.getByRole("button", { name: "Importar" }).click();
  await expect(patients.getByTestId("import-created")).toHaveText("2 pacientes novos");
  await expect(patients.getByTestId("import-existing")).toHaveText("1 já cadastrado");
  await expect(patients.getByTestId("import-errors")).toHaveText("2 linhas com erro");
  await expect(patients.getByTestId("import-error")).toHaveText(["5Informe o celular.", "6Celular inválido: informe o DDD e o número."]);

  // Agenda: 500 lines, 10 with errors, reported by line.
  const agenda = shown(page.getByRole("region", { name: "Agenda", exact: true }));
  await agenda.getByLabel("Arquivo CSV").setInputFiles(csvFile("agenda.csv", agendaLines()));
  await agenda.getByRole("button", { name: "Importar" }).click();
  await expect(agenda.getByTestId("import-created")).toHaveText("490 agendamentos importados", { timeout: 120_000 });
  await expect(agenda.getByTestId("import-errors")).toHaveText("10 linhas com erro");
  await expect(agenda.getByText(/500 linhas/)).toBeVisible();
  await expect(agenda.getByTestId("import-error")).toHaveCount(10);
  await expect(agenda.getByTestId("import-error").first()).toContainText("Tipo de atendimento não encontrado: Massagem");
  await expect(agenda.getByTestId("import-error").last()).toContainText("Conflito de horário");

  const download = page.waitForEvent("download");
  await agenda.getByRole("button", { name: "Baixar relatório de erros (CSV)" }).click();
  const report = await readFile(await (await download).path(), "utf8");
  const reportLines = report.replace(/^﻿/, "").trim().split("\r\n");
  expect(reportLines[0]).toBe("data;hora;profissional;unidade;tipo;paciente;celular;linha;erro");
  expect(reportLines).toHaveLength(11);
  expect(reportLines[1]).toContain(";492;Tipo de atendimento não encontrado: Massagem.");

  // The imported appointments wait for the manager to turn the cadence on.
  const cadence = shown(page.getByRole("region", { name: "Régua dos agendamentos importados" }));
  await expect(cadence.getByTestId("cadence-pending-row")).toContainText(`${PROFESSIONAL_NAME}490`);
  await cadence.getByRole("button", { name: "Ligar régua" }).click();
  await expect(cadence.getByTestId("cadence-pending")).toHaveText("Nenhum agendamento importado esperando a régua.");
});

test("the Pacientes screen records consent, exports and erases the data subject's data", async ({ page }) => {
  await signIn(page, MANAGER_EMAIL);
  await page.getByRole("link", { name: "Pacientes", exact: true }).click();
  await shown(page.getByLabel("Buscar na lista")).fill("joana import");
  await expect(shown(page.getByTestId("patients-total"))).toHaveText('1 encontrado para "joana import"');
  await shown(page.getByRole("link", { name: "Joana Importada" })).click();

  // Every appointment of the patient in the practice (PRD 4, rule 7).
  await expect(page.getByRole("heading", { name: "Joana Importada" })).toBeVisible();
  await expect(shown(page.getByTestId("consent"))).toHaveText("Aceita WhatsApp");
  await expect(shown(page.getByTestId("patient-appointment"))).toHaveCount(10);

  // Manual revocation, a new row in the log (D-47).
  await shown(page.getByLabel("Como o paciente respondeu")).selectOption({ label: "Telefone" });
  await shown(page.getByRole("button", { name: "Revogar consentimento" })).click();
  await expect(shown(page.getByTestId("consent"))).toHaveText("Não aceita");
  await expect(shown(page.getByTestId("consent-history"))).toContainText("Recusa ou revogação");
  await expect(shown(page.getByTestId("consent-history"))).toContainText("Telefone · ");
  await expect(shown(page.getByTestId("consent-history"))).toContainText("Importação");

  // Export: the patient's data in the practice, as JSON.
  const download = page.waitForEvent("download");
  await shown(page.getByRole("button", { name: "Exportar dados (JSON)" })).click();
  const exported = JSON.parse(await readFile(await (await download).path(), "utf8"));
  expect(exported.paciente).toMatchObject({ nome: "Joana Importada", celular: "(85) 99700-0001", convenio: "Unimed", observacoes: "Prefere manhã" });
  expect(exported.consentimentos.map((row: { situacao: string; canal: string }) => `${row.situacao}/${row.canal}`)).toEqual(["Aceita/Importação", "Não aceita/Telefone"]);
  expect(exported.agendamentos).toHaveLength(10);

  // Erasure waits while appointments are open.
  await shown(page.getByLabel("Digite EXCLUIR para confirmar")).fill("EXCLUIR");
  await shown(page.getByRole("button", { name: "Excluir dados do paciente" })).click();
  await expect(shown(page.getByText(/Dê baixa ou cancele os agendamentos em aberto/))).toBeVisible();

  // A patient with nothing open is pseudonymized (D-28).
  await page.goto(page.url().replace(/\/pacientes\/.*$/, "/pacientes?busca=paula"));
  await shown(page.getByRole("link", { name: "Paula Exclui" })).click();
  await expect(page.getByRole("heading", { name: "Paula Exclui" })).toBeVisible();
  await shown(page.getByLabel("Digite EXCLUIR para confirmar")).fill("excluir");
  await shown(page.getByRole("button", { name: "Excluir dados do paciente" })).click();
  await expect(page.getByRole("heading", { name: "Paciente excluído" })).toBeVisible();
  await expect(shown(page.getByText(/Dados pessoais excluídos em/))).toBeVisible();
  await page.goto(page.url().replace(/\/pacientes\/.*$/, "/pacientes?busca=paula"));
  await expect(shown(page.getByTestId("patients-total"))).toHaveText('0 encontrados para "paula"');
});

test("the secretary sees patients and consent, without import or the data subject's requests", async ({ page }) => {
  await signIn(page, SECRETARY_EMAIL);
  await page.getByRole("link", { name: "Pacientes", exact: true }).click();
  await expect(shown(page.getByRole("heading", { name: "Pacientes" }))).toBeVisible();
  await expect(page.getByRole("link", { name: "Importar planilha" })).toHaveCount(0);
  await shown(page.getByRole("link", { name: "Maria Souza E2E" })).click();
  await expect(page.getByRole("heading", { name: "Maria Souza E2E" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Registrar aceite" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportar dados (JSON)" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Excluir dados do paciente" })).toHaveCount(0);
});
