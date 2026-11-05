import type { Metadata } from "next";
import { safeNextPath } from "@/lib/auth/redirects";
import { AccessScreen } from "@/components/app-ui";
import { SecondFactorForm } from "./second-factor-form";

export const metadata: Metadata = { title: "Verificação em duas etapas" };

export default async function SecondFactorPage({ searchParams }: PageProps<"/login/segundo-fator">) {
  const { next } = await searchParams;
  return (
    <AccessScreen title="Verificação em duas etapas" subtitle="Digite o código de 6 dígitos do seu aplicativo autenticador.">
      <SecondFactorForm next={safeNextPath(next)} />
    </AccessScreen>
  );
}
