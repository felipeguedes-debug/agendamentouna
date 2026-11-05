import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/db/client";
import { addPracticeToOrganization, createFirstAccount, OperatorError, reissueAdminInvitation } from "../src/lib/operator/first-account";

/**
 * The operator's way into an empty database (D-93). Uses the database of .env, or of the
 * file passed with `npx tsx --env-file`, as docs/publicacao.md shows.
 *
 *   npm run conta:criar -- --organizacao "Clínica X" --conta "Consultório Y" --unidade "Aldeota" --endereco "Av. X, 100" --email admin@exemplo.com
 *   npm run conta:criar -- --acrescentar --organizacao "Clínica X" --conta "Consultório Z" --unidade "Sul" --endereco "Rua Y, 200"
 *   npm run conta:criar -- --reconvidar --conta "Consultório Y" --email admin@exemplo.com
 *
 * --fuso is optional, America/Fortaleza by default. The invitation goes by e-mail and lasts
 * 7 days; if the e-mail does not leave, the link is printed here.
 */

const { values } = parseArgs({
  options: {
    organizacao: { type: "string", default: "" },
    conta: { type: "string", default: "" },
    unidade: { type: "string", default: "" },
    endereco: { type: "string", default: "" },
    fuso: { type: "string", default: "America/Fortaleza" },
    email: { type: "string", default: "" },
    acrescentar: { type: "boolean", default: false },
    reconvidar: { type: "boolean", default: false },
  },
});

function databaseHost() {
  const url = process.env.DATABASE_URL;
  return url && URL.canParse(url) ? new URL(url).hostname : "(sem DATABASE_URL)";
}

function reportDelivery(email: string, delivery: { delivered: boolean; link: string | null }) {
  if (delivery.delivered) console.info(`Convite enviado para ${email}. Vale por 7 dias e funciona uma vez.`);
  else console.warn(`O e-mail não saiu. Entregue este link a ${email} por outro canal. Vale por 7 dias e funciona uma vez:\n${delivery.link}`);
}

async function main() {
  console.info(`Banco: ${databaseHost()}`);
  const practiceInput = { practice: values.conta, location: values.unidade, address: values.endereco, timeZone: values.fuso };

  if (values.reconvidar) {
    // Base client: an operator's command, the practice is found by its name.
    const practices = await prisma.practice.findMany({ where: { name: values.conta }, select: { id: true } });
    if (practices.length !== 1) throw new OperatorError(`${practices.length} contas com o nome "${values.conta}".`);
    reportDelivery(values.email, await reissueAdminInvitation({ practiceId: practices[0].id, email: values.email }));
    return;
  }

  if (values.acrescentar) {
    const added = await addPracticeToOrganization({ ...practiceInput, organization: values.organizacao });
    console.info(`Conta criada: ${added.practiceId}. Quem administra a organização já a vê.`);
    return;
  }

  const created = await createFirstAccount({ ...practiceInput, organization: values.organizacao, email: values.email });
  console.info(`Organização: ${created.organizationId}\nConta: ${created.practiceId}`);
  reportDelivery(values.email, created);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
