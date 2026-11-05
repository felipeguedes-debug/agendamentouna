import type { Metadata } from "next";
import { Alert, AuthCard, buttonClass } from "@/components/app-ui";
import { describeLinkRequest } from "@/lib/google/link";

export const metadata: Metadata = { title: "Vincular Google Agenda", robots: { index: false } };

/**
 * The link the manager e-mails to the professional (PRD 5, Vínculo; D-59). No
 * login: the professional authorizes with their own Google account, and only then
 * does the practice see their calendar.
 */
export default async function GoogleLinkPage({ params }: PageProps<"/google/vincular/[token]">) {
  const { token } = await params;
  const request = await describeLinkRequest(token);

  if (!request) {
    return (
      <AuthCard title="Link não encontrado">
        <p className="text-sm text-zinc-700">Confira se o link está completo, como veio no e-mail.</p>
      </AuthCard>
    );
  }
  if (request.status !== "pending") {
    return (
      <AuthCard title="Vincular Google Agenda" subtitle={request.practiceName}>
        <Alert tone="info">{request.status === "used" ? "Este link já foi usado." : "Este link venceu."} Peça um novo ao consultório.</Alert>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Vincular Google Agenda" subtitle={`${request.practiceName} · ${request.professionalName}`}>
      <div className="space-y-4 text-sm text-zinc-700">
        <p>
          {request.practiceName} pede acesso ao seu Google Agenda para:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>criar o calendário &quot;{request.practiceName}&quot; e colocar nele os seus atendimentos, com o primeiro nome do paciente e o tipo;</li>
          <li>ver os horários ocupados dos seus outros calendários, sem copiar o conteúdo dos eventos.</li>
        </ul>
        <p>Mudanças que você fizer no Google nos atendimentos ficam pendentes até o consultório aceitar ou reverter.</p>
        <a href={`/api/google/oauth/start?token=${encodeURIComponent(token)}`} className={`${buttonClass} w-full`}>
          Autorizar com a minha conta Google
        </a>
      </div>
    </AuthCard>
  );
}
