import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentSession } from "@/lib/auth/guard";
import { withNext } from "@/lib/auth/redirects";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { getInvitation, MIN_PASSWORD_LENGTH } from "@/lib/users/invitations";
import { Alert, AuthCard, buttonClass, linkClass } from "@/components/app-ui";
import { AcceptExistingForm, NewUserForm } from "./accept-forms";

export const metadata: Metadata = { title: "Convite", robots: { index: false } };

const CLOSED = {
  expired: "Este convite expirou. Peça um novo a quem convidou você.",
  used: "Este convite já foi usado. Se a conta é sua, é só entrar.",
  revoked: "Este convite foi cancelado.",
} as const;

export default async function InvitationPage({ params }: PageProps<"/convite/[token]">) {
  const { token } = await params;
  const invitation = await getInvitation(token);

  if (!invitation) {
    return (
      <AuthCard title="Convite não encontrado">
        <p className="text-sm text-zinc-700">Confira se o link está completo, como veio no e-mail.</p>
      </AuthCard>
    );
  }

  const subtitle = (
    <>
      {invitation.practiceName} · {ROLE_LABELS[invitation.organizationAdmin ? "ORG_ADMIN" : invitation.role]}
    </>
  );

  if (invitation.status !== "pending") {
    return (
      <AuthCard title="Convite para a agenda" subtitle={subtitle}>
        <Alert tone="info">{CLOSED[invitation.status]}</Alert>
        <p className="mt-4 text-sm">
          <Link href="/login" className={linkClass}>
            Ir para o login
          </Link>
        </p>
      </AuthCard>
    );
  }

  if (!invitation.hasAccount) {
    return (
      <AuthCard title="Crie seu acesso" subtitle={subtitle}>
        <NewUserForm token={token} email={invitation.email ?? ""} minPasswordLength={MIN_PASSWORD_LENGTH} />
      </AuthCard>
    );
  }

  const session = await getCurrentSession();
  const signedInWithInvitedEmail = session?.user.email === invitation.email;
  return (
    <AuthCard title="Convite para a agenda" subtitle={subtitle}>
      {signedInWithInvitedEmail ? (
        <AcceptExistingForm token={token} />
      ) : (
        <div className="space-y-4 text-sm text-zinc-700">
          <p>
            Já existe um acesso com <strong>{invitation.email}</strong>. Entre com ele para aceitar o convite; a nova
            conta aparece no seletor, sem precisar sair das outras.
          </p>
          {session ? (
            <Alert tone="info">
              Você está conectado como {session.user.email}. Saia e entre com o e-mail do convite.
            </Alert>
          ) : (
            <Link href={withNext("/login", `/convite/${token}`)} className={`${buttonClass} w-full`}>
              Entrar para aceitar
            </Link>
          )}
        </div>
      )}
    </AuthCard>
  );
}
