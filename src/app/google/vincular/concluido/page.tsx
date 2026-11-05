import type { Metadata } from "next";
import { Alert, AuthCard } from "@/components/app-ui";
import { GOOGLE_LINK_ERROR_TEXT, type GoogleLinkErrorCode } from "@/lib/google/link";

export const metadata: Metadata = { title: "Google Agenda", robots: { index: false } };

function isErrorCode(value: unknown): value is GoogleLinkErrorCode {
  return typeof value === "string" && value in GOOGLE_LINK_ERROR_TEXT;
}

/** Where the link ends for whoever came from an e-mailed link, and where a failed link explains itself (D-59). */
export default async function GoogleLinkDonePage({ searchParams }: PageProps<"/google/vincular/concluido">) {
  const { erro } = await searchParams;
  if (isErrorCode(erro)) {
    return (
      <AuthCard title="Google Agenda não vinculado">
        <Alert>{GOOGLE_LINK_ERROR_TEXT[erro]}</Alert>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Google Agenda vinculado">
      <p className="text-sm text-zinc-700">
        Pronto. Em instantes o calendário do consultório aparece no seu Google Agenda, com os atendimentos futuros. Pode fechar esta página.
      </p>
    </AuthCard>
  );
}
