import "dotenv/config";
import { parseArgs } from "node:util";
import { decryptSecret } from "../src/lib/crypto/secrets";
import { prisma } from "../src/lib/db/client";
import { normalizePhone } from "../src/lib/patients/phone";

/**
 * Sends the app a patient's answer as the WhatsAPI webhook would (Block 5), for
 * development with the sandbox provider, which sends nothing for real.
 *
 *   npm run whatsapi:reply -- --celular "85 99812-4455" --texto 1
 *
 * The instance is the one that sent the patient's latest cadence message, unless
 * --instancia says otherwise; --url defaults to http://localhost:3000.
 */

async function main() {
  const { values } = parseArgs({ options: { celular: { type: "string" }, texto: { type: "string" }, instancia: { type: "string" }, url: { type: "string" } } });
  const phone = values.celular ? normalizePhone(values.celular) : null;
  if (!phone || values.texto === undefined) throw new Error('Use --celular "85 99812-4455" --texto 1');

  // Base client: a development script, it finds the patient's practice by the phone.
  const latest = values.instancia
    ? null
    : await prisma.dispatch.findFirst({
        where: { appointment: { patient: { phone } }, sentAt: { not: null }, whatsappInstanceId: { not: null } },
        orderBy: { sentAt: "desc" },
        select: { whatsappInstanceId: true },
      });
  const instanceId = values.instancia ?? latest?.whatsappInstanceId;
  if (!instanceId) throw new Error("No cadence message was sent to this phone; pass --instancia");
  const instance = await prisma.whatsappInstance.findUniqueOrThrow({ where: { id: instanceId } });

  const jid = `${phone.slice(1)}@s.whatsapp.net`;
  const response = await fetch(`${values.url ?? "http://localhost:3000"}/api/webhooks/whatsapi/${instance.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      EventType: "messages",
      owner: instance.phoneNumber?.slice(1) ?? "",
      token: decryptSecret(instance.tokenEncrypted),
      BaseUrl: instance.apiUrl,
      message: { id: `sim:${Date.now()}`, messageid: `SIM${Date.now()}`, chatid: jid, sender: jid, fromMe: false, isGroup: false, messageType: "Conversation", text: values.texto, messageTimestamp: Date.now() },
    }),
  });
  console.info(`${response.status} ${await response.text()}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
