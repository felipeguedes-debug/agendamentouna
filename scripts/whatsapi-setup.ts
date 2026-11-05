import "dotenv/config";
import { parseArgs } from "node:util";
import { encryptSecret } from "../src/lib/crypto/secrets";
import { assertLocalDatabase } from "../src/lib/db/connection";
import { setInstanceConnection } from "../src/lib/cadence/instances";
import { prisma } from "../src/lib/db/client";
import { WhatsapiProvider } from "../src/lib/messaging/whatsapi";

/**
 * Registers a WhatsAPI test instance for one professional of the development
 * database and points the instance's webhook at this app (Block 5, D-51).
 *
 *   npm run whatsapi:setup -- --profissional "Dr. Otávio Lemos"
 *
 * Reads WHATSAPI_API_URL and WHATSAPI_TOKEN (the instance's server and token, from
 * the WhatsAPI panel) and PUBLIC_WEBHOOK_URL (the HTTPS tunnel, e.g. cloudflared).
 * Use a test number, never a professional's. To really send, set
 * MESSAGING_PROVIDER="whatsapi" and MESSAGING_ALLOWED_NUMBERS with the test phones:
 * outside production nothing goes to any other number. A real instance is registered on
 * the professional's screen (D-94).
 */

async function main() {
  assertLocalDatabase("Este script de desenvolvimento");
  const { values } = parseArgs({ options: { profissional: { type: "string" } } });
  const apiUrl = process.env.WHATSAPI_API_URL?.trim();
  const token = process.env.WHATSAPI_TOKEN?.trim();
  const publicUrl = process.env.PUBLIC_WEBHOOK_URL?.trim().replace(/\/+$/, "");
  if (!values.profissional || !apiUrl || !token || !publicUrl) {
    throw new Error('Use --profissional "Nome" and set WHATSAPI_API_URL, WHATSAPI_TOKEN and PUBLIC_WEBHOOK_URL in .env');
  }

  // Base client: a development script that works across practices by name.
  const professional = await prisma.professional.findFirst({ where: { name: values.profissional, active: true }, select: { id: true, practiceId: true, name: true } });
  if (!professional) throw new Error(`Professional "${values.profissional}" not found`);

  const client = new WhatsapiProvider({ apiUrl, token });
  const connection = await client.getConnection();
  const data = { providerInstanceId: apiUrl, apiUrl, tokenEncrypted: encryptSecret(token) };
  const instance = await prisma.whatsappInstance.upsert({
    where: { professionalId_practiceId: { professionalId: professional.id, practiceId: professional.practiceId } },
    create: { practiceId: professional.practiceId, professionalId: professional.id, ...data },
    update: data,
  });
  await setInstanceConnection(professional.practiceId, instance.id, connection, new Date());
  const webhook = `${publicUrl}/api/webhooks/whatsapi/${instance.id}`;
  await client.configureWebhook(webhook);
  // Dispatches planned while the professional had no instance now have one.
  await prisma.dispatch.updateMany({ where: { whatsappInstanceId: null, status: "SCHEDULED", appointment: { professionalId: professional.id } }, data: { whatsappInstanceId: instance.id } });

  console.info(`${professional.name}: instância ${instance.id} (${connection}). Webhook: ${webhook}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
