import type { Metadata } from "next";
import { googleSignInEnabled } from "@/lib/auth/auth";
import { safeNextPath } from "@/lib/auth/redirects";
import { AccessScreen } from "@/components/app-ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

/** Errors the Google callback sends back in `?error=` (Better Auth codes). */
function googleErrorText(code: string | string[] | undefined) {
  if (typeof code !== "string") return undefined;
  if (code === "signup_disabled") return "Este e-mail do Google não tem convite para a agenda.";
  if (code === "account_not_linked") return "Não foi possível usar o Google com este e-mail. Entre com e-mail e senha.";
  return "Não foi possível entrar com o Google. Tente de novo.";
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  return (
    <AccessScreen title="Entrar" subtitle="Use o e-mail em que você recebeu o convite.">
      <LoginForm next={safeNextPath(next)} googleEnabled={googleSignInEnabled} initialError={googleErrorText(error)} />
    </AccessScreen>
  );
}
