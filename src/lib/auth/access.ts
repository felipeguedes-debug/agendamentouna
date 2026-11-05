import { forPractice, isUuid, prisma, type PracticeScopedClient } from "@/lib/db";
import type { AccessRole } from "./permissions";

/**
 * Which practices a user reaches, and with which role (PRD 3; D-39): an active
 * Membership (no revokedAt) gives its role; an active OrganizationMember gives
 * ORG_ADMIN in every practice of the organization, which prevails over a membership.
 *
 * Cross-practice by definition, so it reads through the base client. Practice data
 * itself goes through the scoped client that `practiceContext()` hands out.
 */

export type PracticeAccess = {
  practiceId: string;
  practiceName: string;
  organizationId: string;
  role: AccessRole;
  requireTwoFactor: boolean;
};

export type SessionUser = { id: string; name: string; email: string };

/** What a page or Server Action gets after the access check: only then a scoped client. */
export type PracticeContext = { user: SessionUser; access: PracticeAccess; db: PracticeScopedClient };

const PRACTICE_FIELDS = { id: true, name: true, organizationId: true, requireTwoFactor: true } as const;

type PracticeRow = { id: string; name: string; organizationId: string; requireTwoFactor: boolean };

function toAccess(practice: PracticeRow, role: AccessRole): PracticeAccess {
  return {
    practiceId: practice.id,
    practiceName: practice.name,
    organizationId: practice.organizationId,
    role,
    requireTwoFactor: practice.requireTwoFactor,
  };
}

const activeAdmin = (userId: string) => ({ userId, revokedAt: null, role: "ADMIN" as const });

export async function listPracticeAccess(userId: string): Promise<PracticeAccess[]> {
  const [memberships, administered] = await Promise.all([
    prisma.membership.findMany({
      where: { userId, revokedAt: null },
      select: { role: true, practice: { select: PRACTICE_FIELDS } },
    }),
    prisma.practice.findMany({
      where: { organization: { members: { some: activeAdmin(userId) } } },
      select: PRACTICE_FIELDS,
    }),
  ]);
  const byPractice = new Map<string, PracticeAccess>();
  for (const membership of memberships) {
    byPractice.set(membership.practice.id, toAccess(membership.practice, membership.role));
  }
  for (const practice of administered) byPractice.set(practice.id, toAccess(practice, "ORG_ADMIN"));
  return [...byPractice.values()].sort((a, b) => a.practiceName.localeCompare(b.practiceName, "pt-BR"));
}

export async function getPracticeAccess(userId: string, practiceId: string): Promise<PracticeAccess | null> {
  if (!isUuid(practiceId)) return null;
  const practice = await prisma.practice.findUnique({
    where: { id: practiceId },
    select: {
      ...PRACTICE_FIELDS,
      memberships: { where: { userId, revokedAt: null }, select: { role: true } },
      organization: { select: { members: { where: activeAdmin(userId), select: { id: true } } } },
    },
  });
  if (!practice) return null;
  if (practice.organization.members.length > 0) return toAccess(practice, "ORG_ADMIN");
  const membership = practice.memberships[0];
  return membership ? toAccess(practice, membership.role) : null;
}

/** The practices where the user reaches the agenda and also attends: the professional's PWA (D-76). */
export async function listProfessionalAccess(userId: string): Promise<PracticeAccess[]> {
  const practices = await listPracticeAccess(userId);
  const attending = await prisma.professional.findMany({
    where: { userId, active: true, practiceId: { in: practices.map((access) => access.practiceId) } },
    select: { practiceId: true },
  });
  const ids = new Set(attending.map((row) => row.practiceId));
  return practices.filter((access) => ids.has(access.practiceId));
}

/** D-16: two-factor is required when any practice the user reaches requires it. */
export async function isTwoFactorRequired(userId: string) {
  return (await listPracticeAccess(userId)).some((access) => access.requireTwoFactor);
}

/**
 * The same reach seen from the practice: whoever `isTwoFactorRequired` would stop if this
 * practice required it. The organization's admins have no Membership here, so this also
 * reads through the base client.
 */
export async function listUsersWithoutTwoFactor({ practiceId, organizationId }: Pick<PracticeAccess, "practiceId" | "organizationId">) {
  return prisma.user.findMany({
    where: {
      twoFactorEnabled: false,
      OR: [
        { memberships: { some: { practiceId, revokedAt: null } } },
        { organizationMemberships: { some: { organizationId, revokedAt: null, role: "ADMIN" } } },
      ],
    },
    select: { id: true, name: true },
  });
}

export function practiceContext(user: SessionUser, access: PracticeAccess): PracticeContext {
  return { user: { id: user.id, name: user.name, email: user.email }, access, db: forPractice(access.practiceId) };
}
