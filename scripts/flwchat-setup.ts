import "dotenv/config";
import { parseArgs } from "node:util";
import { connectPractice } from "../src/lib/crm/connection";
import { crmMode } from "../src/lib/crm/index";
import { prisma } from "../src/lib/db/client";

/**
 * Connects a practice of the development database to the test FlwChat account (Block 7,
 * D-70), with FLWCHAT_TOKEN from .env, without the token going through the screen or the
 * terminal. Needs CRM_PROVIDER="flwchat" and, for the webhook, PUBLIC_WEBHOOK_URL.
 *
 *   npm run flwchat:setup -- --conta "Clínica Dra. Marina"
 */

async function main() {
  const { values } = parseArgs({ options: { conta: { type: "string" } } });
  if (!values.conta) throw new Error('Use --conta "Nome da conta"');
  if (crmMode() !== "flwchat") throw new Error('Ponha CRM_PROVIDER="flwchat" no .env');
  const token = process.env.FLWCHAT_TOKEN;
  if (!token) throw new Error("Ponha o token da conta de teste em FLWCHAT_TOKEN, no .env");

  // Base client: a development script, the practice is found by its name.
  const practices = await prisma.practice.findMany({ where: { name: values.conta }, select: { id: true } });
  if (practices.length !== 1) throw new Error(`${practices.length} contas com esse nome`);

  await connectPractice(practices[0].id, token, { actorUserId: null });
  const connection = await prisma.crmConnection.findUniqueOrThrow({ where: { practiceId: practices[0].id }, select: { crmAccount: { select: { status: true, subscriptionId: true } } } });
  console.info(`Conectada (${connection.crmAccount.status}). Webhook: ${connection.crmAccount.subscriptionId ? "registrado" : "sem endereço público"}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
