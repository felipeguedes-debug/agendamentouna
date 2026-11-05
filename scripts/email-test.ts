import "dotenv/config";
import { parseArgs } from "node:util";
import { getEmailSender } from "@/lib/email/sender";

/**
 * Sends one test message through the configured provider (D-90), to check the Gmail
 * account before using it. Needs EMAIL_PROVIDER, GMAIL_USER and GMAIL_APP_PASSWORD in
 * .env, and outside production the recipient in EMAIL_ALLOWED_RECIPIENTS.
 *
 *   npm run email:teste -- --para voce@exemplo.com
 */

const { values } = parseArgs({ options: { para: { type: "string" } } });

async function main() {
  if (!values.para) throw new Error("Informe --para voce@exemplo.com");
  if (!process.env.EMAIL_PROVIDER) throw new Error("EMAIL_PROVIDER não está definido: a mensagem sairia só no terminal");
  await getEmailSender().send({
    to: values.para,
    subject: "Teste de envio da Agenda",
    text: "Se você recebeu esta mensagem, a Agenda já consegue enviar e-mails: convites, link do Google e senha esquecida.",
  });
  console.log(process.env.EMAIL_PROVIDER === "console" ? "A mensagem saiu só no terminal: EMAIL_PROVIDER é console." : `Enviado pelo Gmail. Confira a caixa de entrada de ${values.para}.`);
}

main().catch((error: Error) => {
  console.error(`Não foi possível enviar: ${error.message}`);
  process.exitCode = 1;
});
