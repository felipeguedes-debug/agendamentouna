import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db";
import { UsersError } from "./errors";

/** Members of a practice ("Usuários e papéis", PRD 3). */

export async function listMembers({ db }: PracticeContext) {
  const memberships = await db.membership.findMany({
    where: { revokedAt: null },
    select: { id: true, role: true, user: { select: { id: true, name: true, email: true } } },
  });
  return memberships
    .map((membership) => ({
      membershipId: membership.id,
      userId: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * "Desligar": access ends at once, because every request checks the membership,
 * and the row stays for the history (PRD 3, req. 5). Reserved to the admin.
 */
export async function revokeMembership({ user, access, db }: PracticeContext, membershipId: string) {
  if (!can(access.role, "users:manage")) throw new UsersError("not_allowed", "Cannot revoke members");
  const membership = isUuid(membershipId) ? await db.membership.findUnique({ where: { id: membershipId } }) : null;
  if (!membership || membership.revokedAt) throw new UsersError("not_found", "Membership not found");
  if (membership.userId === user.id) throw new UsersError("cannot_revoke_self", "Cannot revoke own access");

  await db.$transaction(async (tx) => {
    await tx.membership.update({ where: { id: membership.id }, data: { revokedAt: new Date() } });
    await tx.auditEvent.create({
      data: {
        practiceId: access.practiceId,
        actorType: "USER",
        actorUserId: user.id,
        action: "membership.revoked",
        entityType: "Membership",
        entityId: membership.id,
        changedFields: ["revokedAt"],
      },
    });
  });
}
