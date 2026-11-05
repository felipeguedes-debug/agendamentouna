import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, linkClass } from "@/components/app-ui";
import { PRIVACY_VERSION } from "@/lib/legal/privacy";

export const metadata: Metadata = { title: "Política de privacidade" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}

// Provisional text until the legal text arrives (D-99), as /termos is (D-38). It says what the
// system does, as the PRD and the decisions describe it, and takes no legal position beyond them.
export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12 text-sm leading-6 text-zinc-700 sm:px-6">
      <div className="flex flex-col gap-1">
        <Link href="/" className={linkClass}>
          ← Agenda
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">Política de privacidade</h1>
        <p className="text-zinc-600">Versão {PRIVACY_VERSION}</p>
      </div>

      <Alert tone="info">Texto provisório. A versão definitiva será publicada antes do uso com pacientes reais.</Alert>

      <Section title="Quem usa este sistema">
        <p>A Agenda é usada por consultórios particulares para marcar atendimentos, lembrar pacientes pelo WhatsApp e manter o Google Agenda dos profissionais em dia. Os dados são lançados pela equipe de cada consultório, e cada conta só enxerga os próprios dados.</p>
      </Section>

      <Section title="Que dados são tratados">
        <ul className="list-disc space-y-1 pl-5">
          <li>Da equipe: nome, e-mail, senha guardada com hash forte, verificação em duas etapas e as ações registradas na trilha de auditoria.</li>
          <li>Dos pacientes: nome, celular, convênio, observações, agendamentos e o registro do consentimento de contato. A existência de um atendimento já é dado sensível pela LGPD.</li>
        </ul>
      </Section>

      <Section title="Para que">
        <p>Para operar a agenda do consultório, por execução de contrato, com o exercício regular de direitos em contrato (art. 11, II, d, da LGPD) como hipótese correspondente para o dado sensível. Os lembretes por WhatsApp dependem do consentimento do paciente, que pode ser revogado respondendo PARAR ou pedindo ao consultório.</p>
      </Section>

      <Section title="Dados do Google">
        <p>O login com Google pede só nome e e-mail. O acesso ao Google Agenda é pedido à parte, ao profissional que decide vincular a própria conta, e serve para:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>criar um calendário próprio da agenda na conta dele e escrever só nesse calendário, com o primeiro nome do paciente e o nome exibido do tipo de atendimento;</li>
          <li>ler a lista de calendários, para ele escolher quais contam como ocupado;</li>
          <li>ler os eventos desses calendários, para marcar o horário como ocupado. O sistema guarda só o horário: não copia o título, a descrição, o local nem os participantes.</li>
        </ul>
        <p>Os tokens ficam criptografados. Esses dados não são vendidos, não são usados para publicidade e não são usados para treinar modelos de inteligência artificial. O uso de informações recebidas das APIs do Google seguirá a Política de Dados do Usuário dos Serviços de API do Google, incluindo os requisitos de Uso Limitado.</p>
        <p>O profissional ou o gestor podem desvincular a conta a qualquer momento: o calendário criado pelo sistema e os horários lidos do Google são apagados, e o acesso é revogado. O acesso também pode ser revogado nas configurações da conta Google.</p>
      </Section>

      <Section title="Quem mais trata esses dados">
        <p>Operadores que o sistema usa para funcionar:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Vercel, que hospeda a aplicação, e Supabase, que guarda o banco de dados;</li>
          <li>Inngest, que executa as filas de trabalho e recebe só identificadores;</li>
          <li>WhatsAPI, que envia e recebe as mensagens da régua, e SynkronosCRM, onde ficam as conversas do consultório;</li>
          <li>Google, pelo Google Agenda e pelo envio de e-mails do sistema;</li>
          <li>Google, Apple e Mozilla, que entregam os avisos da PWA criptografados, sem ler o conteúdo. O aviso nunca diz o nome do paciente.</li>
        </ul>
      </Section>

      <Section title="Direitos do titular">
        <p>O paciente exerce os direitos dele junto ao consultório. A exportação dos dados e a exclusão são feitas pelo gestor da conta, em até 15 dias do pedido. A exclusão retira os dados pessoais e mantém o registro na trilha de auditoria, que não guarda valores pessoais.</p>
      </Section>

      <Section title="Segurança">
        <p>Conexões com TLS, tokens de integração criptografados, isolamento dos dados por conta, verificação em duas etapas e trilha de auditoria que não pode ser alterada.</p>
      </Section>

      <Section title="Contato">
        <p>O canal de contato e o encarregado de dados serão informados no texto definitivo.</p>
      </Section>

      <p>
        Veja também os{" "}
        <Link href="/termos" className={linkClass}>
          termos de uso
        </Link>
        .
      </p>
    </main>
  );
}
