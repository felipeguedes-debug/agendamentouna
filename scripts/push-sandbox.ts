import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/db/client";
import { practicesWithPendingPush, sendConfirmationPushes } from "../src/lib/push/notify";
import { hashEndpoint } from "../src/lib/push/subscriptions";

/**
 * The Web Push of the PWA (Block 8, D-78) without Inngest and without a phone, for
 * development and the end-to-end flows.
 *
 *   npm run push:sandbox -- enviar                  sends the waiting notices, as the tick does
 *   npm run push:sandbox -- listar [--endpoint url] what the fake provider "delivered"
 *   npm run push:sandbox -- assinaturas --email x   how many devices of that person hear
 */

const OPTIONS = { endpoint: { type: "string" }, email: { type: "string" } } as const;

async function main() {
  const { positionals, values } = parseArgs({ args: process.argv.slice(2), options: OPTIONS, allowPositionals: true });
  const [command] = positionals;

  if (command === "enviar") {
    let sent = 0;
    for (const { practiceId } of await practicesWithPendingPush()) sent += (await sendConfirmationPushes(practiceId)).sent;
    console.log(`Avisos enviados: ${sent}`);
    return;
  }
  if (command === "listar") {
    // Base client: a development script, and a device belongs to no practice.
    const messages = await prisma.sandboxPushMessage.findMany({
      where: values.endpoint ? { endpointHash: hashEndpoint(values.endpoint) } : {},
      orderBy: { sentAt: "desc" },
      take: 50,
    });
    for (const message of messages) console.log(`${message.sentAt.toISOString()} · ${message.title} · ${message.body} · ${message.url}`);
    console.log(`Avisos: ${messages.length}`);
    return;
  }
  if (command === "assinaturas") {
    if (!values.email) throw new Error('Use --email "pessoa@example.com"');
    console.log(`Assinaturas: ${await prisma.pushSubscription.count({ where: { user: { email: values.email } } })}`);
    return;
  }
  throw new Error('Use "enviar", "listar" ou "assinaturas"');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
