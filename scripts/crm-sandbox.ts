import "dotenv/config";
import { parseArgs } from "node:util";
import { exportToCrm } from "../src/lib/crm/outbound";
import { reconcileNextDay } from "../src/lib/crm/reconcile";
import { applySandboxTag, SANDBOX_TOKEN_PREFIX, sandboxWebhookBody } from "../src/lib/crm/sandbox";
import { decryptSecret } from "../src/lib/crypto/secrets";
import { prisma } from "../src/lib/db/client";
import { normalizePhone, phoneVariants } from "../src/lib/patients/phone";

/**
 * Plays the secretary's side of the sandbox CRM (Block 7, D-66), for development and the
 * end-to-end flows. What a real FlwChat would do, including posting the event to the
 * subscribed URL, so `npm run dev` must be up for "etiqueta".
 *
 *   npm run crm:sandbox -- etiqueta --celular "85 99812-4455" --etiqueta "Confirmar na agenda"
 *   npm run crm:sandbox -- etiqueta --celular ... --etiqueta "Contato manual na agenda" --sem-webhook
 *   npm run crm:sandbox -- listar --celular ...
 *   npm run crm:sandbox -- sincronizar
 *   npm run crm:sandbox -- reconciliar
 *
 * --sem-webhook leaves the tag without posting the event, as a lost webhook would.
 * "sincronizar" and "reconciliar" do at once what Inngest does on its own.
 * --conta "Nome" picks the practice when the phone is in more than one.
 */

const OPTIONS = {
  celular: { type: "string" },
  etiqueta: { type: "string" },
  conta: { type: "string" },
  "sem-webhook": { type: "boolean" },
} as const;

function phoneOf(value: string | undefined) {
  const phone = value ? normalizePhone(value) : null;
  if (!phone) throw new Error('Use --celular "85 99812-4455"');
  return phone;
}

async function connectedPractices(name?: string) {
  // Base client: a development script, it runs for every practice.
  return prisma.practice.findMany({ where: { crmConnection: { isNot: null }, ...(name ? { name } : {}) }, select: { id: true, name: true } });
}

/** The fake account of a practice is the key of its token. */
async function accountKeyOf(name: string) {
  // Base client: a development script, the practice is found by its name.
  const connection = await prisma.crmConnection.findFirst({ where: { practice: { is: { name } } }, select: { crmAccount: { select: { tokenEncrypted: true } } } });
  if (!connection) throw new Error("Essa conta não está conectada ao CRM falso");
  return decryptSecret(connection.crmAccount.tokenEncrypted).slice(SANDBOX_TOKEN_PREFIX.length);
}

async function contactOf(phone: string, name?: string) {
  const accountKey = name ? await accountKeyOf(name) : undefined;
  // Base client: a development script, the fake CRM belongs to no practice.
  const contacts = await prisma.sandboxCrmContact.findMany({
    where: { phone: { in: phoneVariants(phone) }, ...(accountKey ? { accountKey } : {}) },
    include: { notes: { orderBy: { createdAt: "asc" } } },
  });
  if (contacts.length === 0) throw new Error("Nenhum contato com esse celular no CRM falso: rode sincronizar");
  if (contacts.length > 1) throw new Error("Celular em mais de uma conta: use --conta");
  return contacts[0];
}

async function tag(values: { celular?: string; etiqueta?: string; conta?: string; "sem-webhook"?: boolean }) {
  if (!values.etiqueta) throw new Error('Use --etiqueta "Confirmar na agenda"');
  const contact = await contactOf(phoneOf(values.celular), values.conta);
  await applySandboxTag(contact.accountKey, contact.id, values.etiqueta);
  if (values["sem-webhook"]) {
    console.info("Etiqueta aplicada, sem webhook");
    return;
  }
  const subscription = await prisma.sandboxCrmSubscription.findFirst({ where: { accountKey: contact.accountKey } });
  if (!subscription) throw new Error("A conta não tem webhook registrado");
  const response = await fetch(subscription.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(await sandboxWebhookBody(contact.accountKey, contact.id)) });
  console.info(`${response.status} ${await response.text()}`);
}

async function list(values: { celular?: string; conta?: string }) {
  const contact = await contactOf(phoneOf(values.celular), values.conta);
  console.info(`Contato: ${contact.name} (${contact.phone})`);
  console.info(`Etiquetas: ${contact.tagNames.join(", ") || "nenhuma"}`);
  for (const note of contact.notes) console.info(`Nota: ${note.text}`);
}

async function main() {
  const { values, positionals } = parseArgs({ options: OPTIONS, allowPositionals: true });
  const command = positionals[0];
  if (command === "etiqueta") return tag(values);
  if (command === "listar") return list(values);
  if (command === "sincronizar") {
    for (const practice of await connectedPractices(values.conta)) console.info(`${practice.name}: ${JSON.stringify(await exportToCrm(practice.id))}`);
    return;
  }
  if (command === "reconciliar") {
    for (const practice of await connectedPractices(values.conta)) console.info(`${practice.name}: ${JSON.stringify(await reconcileNextDay(practice.id))}`);
    return;
  }
  throw new Error("Comandos: etiqueta, listar, sincronizar, reconciliar");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
