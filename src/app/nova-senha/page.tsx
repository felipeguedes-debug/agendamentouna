import type { Metadata } from "next";
import Link from "next/link";
import { AccessScreen, buttonClass } from "@/components/app-ui";
import { MIN_PASSWORD_LENGTH } from "@/lib/users/invitations";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Criar senha nova" };

/**
 * Where the e-mail's link lands (D-88). Better Auth checks the link first and comes
 * back with ?token= or, when it expired or was used, ?error=.
 */
export default async function NewPasswordPage({ searchParams }: PageProps<"/nova-senha">) {
  const { token, error } = await searchParams;
  if (typeof token !== "string" || !token || error) {
    return (
      <AccessScreen title="Este link não vale mais" subtitle="O link dura 1 hora e só funciona uma vez. Peça outro para criar sua senha.">
        <Link href="/esqueci-senha" className={`${buttonClass} w-full text-center`}>
          Pedir outro link
        </Link>
      </AccessScreen>
    );
  }
  return (
    <AccessScreen title="Criar senha nova">
      <NewPasswordForm token={token} minPasswordLength={MIN_PASSWORD_LENGTH} />
    </AccessScreen>
  );
}
