import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, linkClass } from "@/components/app-ui";

export const metadata: Metadata = {
  title: { absolute: "Agenda: agenda de consultórios com Google Agenda e WhatsApp" },
  alternates: { canonical: "/" },
};

const POINTS = [
  { title: "Agenda da equipe", text: "Secretária e gestor marcam, confirmam e remarcam numa tela só, com o tipo de atendimento e o valor em cada horário." },
  { title: "Lembretes por WhatsApp", text: "Os pacientes que aceitaram contato recebem os lembretes pelo número do profissional, e a resposta muda o status do agendamento." },
  { title: "Google Agenda de mão dupla", text: "Cada profissional vincula a própria conta. Os atendimentos vão para um calendário próprio, e os outros compromissos ocupam o horário sem que o conteúdo deles seja copiado." },
];

/** The public home page at / (D-99), for visitors and for Google's verification of the app. Say what it does; nobody signs up here (D-38). */
export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-4 py-12 sm:px-6">
      <div className="flex flex-col gap-4">
        <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-[11px] bg-primary text-lg font-bold text-primary-foreground">
          A
        </span>
        <h1 className="text-[30px] leading-tight font-semibold tracking-tight">Agenda: o consultório com WhatsApp e Google Agenda no mesmo lugar.</h1>
        <p className="text-base leading-7 text-[#3A4542]">Sistema de agendamento para consultórios particulares. O acesso é por convite do consultório: não há cadastro aberto.</p>
      </div>

      <ul className="flex flex-col gap-5">
        {POINTS.map(({ title, text }) => (
          <li key={title} className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">{title}</h2>
            <p className="text-sm leading-6 text-[#3A4542]">{text}</p>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href="/login" className={buttonClass}>
          Entrar
        </Link>
        <Link href="/privacidade" className={linkClass}>
          Política de privacidade
        </Link>
        <Link href="/termos" className={linkClass}>
          Termos de uso
        </Link>
      </div>
    </main>
  );
}
