import "dotenv/config";
import { parseArgs } from "node:util";
import { forPractice, prisma } from "../src/lib/db";
import { lastDaysPeriod, loadPracticeHealth } from "../src/lib/observability/health";

/**
 * The operation's panel across every organization (D-101), for the operator: the screen only
 * shows the practice, or the admin's own organization.
 *
 *   npm run operador:saude -- --dias 7
 *
 * Practice data still goes through each practice's scoped client. No patient's data here.
 */

const percent = (value: number | null) => (value === null ? "sem dados" : `${(value * 100).toFixed(1)}%`);

async function main() {
  const { values } = parseArgs({ options: { dias: { type: "string", default: "7" } } });
  const days = Number(values.dias);
  if (!Number.isInteger(days) || days < 1) throw new Error("Use --dias com um número inteiro de dias");
  const period = lastDaysPeriod(days);

  // Base client: an operator's command, it lists every practice.
  const practices = await prisma.practice.findMany({ select: { id: true, name: true, organization: { select: { name: true } } }, orderBy: [{ organization: { name: "asc" } }, { name: "asc" }] });
  const rows = [];
  for (const practice of practices) {
    const { delivery, instances, google, crm, serverErrors } = await loadPracticeHealth(forPractice(practice.id), period);
    rows.push({
      organizacao: practice.organization.name,
      conta: practice.name,
      entrega: percent(delivery.rate.value),
      "nao saiu": delivery.neverSent,
      "sem conexao": instances.notConnected,
      "falha google": percent(google.failures.value),
      "fila google": google.waiting,
      "falha crm": crm.failed,
      "fila crm": crm.waiting,
      erros: serverErrors.total,
    });
  }
  console.info(`De ${period.start} até hoje. Erros sem conta ficam só no log da hospedagem.`);
  console.table(rows);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
