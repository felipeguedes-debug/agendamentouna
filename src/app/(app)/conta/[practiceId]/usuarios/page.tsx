import type { Metadata } from "next";
import { can, invitableRoles } from "@/lib/auth/permissions";
import { requirePracticePermission } from "@/lib/auth/guard";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { listPendingInvitations } from "@/lib/users/invitations";
import { listMembers } from "@/lib/users/members";
import { PageHeader } from "@/components/app-ui";
import { InviteForm, RowAction } from "./users-forms";

export const metadata: Metadata = { title: "Usuários" };

const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit" });

/** "Usuários e papéis" (PRD 3): members, pending invitations and the invitation form. */
export default async function UsersPage({ params }: PageProps<"/conta/[practiceId]/usuarios">) {
  const { practiceId } = await params;
  const context = await requirePracticePermission(practiceId, "users:invite");
  const { user, access, db } = context;
  const [members, invitations, professionals] = await Promise.all([
    listMembers(context),
    listPendingInvitations(context),
    db.professional.findMany({ where: { userId: null, active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const roles = invitableRoles(access.role);
  const canRemove = can(access.role, "users:manage");

  return (
    <>
      <PageHeader title="Usuários" description="Quem acessa esta conta e com qual papel." />
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">Com acesso</h2>
            <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
              {members.map((member) => (
                <li key={member.membershipId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-zinc-900">{member.name}</p>
                    <p className="text-zinc-500">
                      {member.email} · {ROLE_LABELS[member.role]}
                    </p>
                  </div>
                  {canRemove && member.userId !== user.id ? (
                    <RowAction
                      kind="member"
                      practiceId={practiceId}
                      id={member.membershipId}
                      label="Remover acesso"
                      confirmText={`Remover o acesso de ${member.name} a esta conta? O histórico das ações fica.`}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold text-zinc-900">Convites pendentes</h2>
            {invitations.length === 0 ? (
              <p className="text-sm text-zinc-500">Nenhum convite pendente.</p>
            ) : (
              <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white">
                {invitations.map((invitation) => (
                  <li key={invitation.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <div>
                      <p className="font-medium text-zinc-900">{invitation.email}</p>
                      <p className="text-zinc-500">
                        {ROLE_LABELS[invitation.role]}
                        {invitation.professional ? ` · ${invitation.professional.name}` : ""} · vale até{" "}
                        {dateFormat.format(invitation.expiresAt)}
                      </p>
                    </div>
                    {roles.includes(invitation.role) ? (
                      <RowAction kind="invitation" practiceId={practiceId} id={invitation.id} label="Cancelar" />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <section className="h-fit rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Convidar</h2>
          <InviteForm
            practiceId={practiceId}
            roles={roles.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
            professionals={professionals}
          />
        </section>
      </div>
    </>
  );
}
