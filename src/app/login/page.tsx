import type { Metadata } from "next";
import { cookies } from "next/headers";
import { googleSignInEnabled } from "@/lib/auth/auth";
import { safeNextPath } from "@/lib/auth/redirects";
import { ENTRY_NOTICE_COOKIE, entryNoticeAccepted } from "@/lib/legal/notice";
import { AccessScreen } from "@/components/app-ui";
import { EntryNotice } from "./entry-notice";
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
  const { next: asked, error, aviso } = await searchParams;
  const next = safeNextPath(asked);
  const screen = (
    <AccessScreen title="Entrar" subtitle="Use o e-mail em que você recebeu o convite.">
      <LoginForm next={next} googleEnabled={googleSignInEnabled} initialError={googleErrorText(error)} />
    </AccessScreen>
  );
  // Once per device, until the terms or the policy change (D-106).
  if (entryNoticeAccepted((await cookies()).get(ENTRY_NOTICE_COOKIE)?.value)) return screen;
  return (
    <>
      <div inert className="flex flex-1 flex-col">
        {screen}
      </div>
      <EntryNotice next={next} declined={aviso === "recusado"} />
    </>
  );
}
