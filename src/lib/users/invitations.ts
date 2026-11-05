import { createHash, randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import type { Invitation, Prisma } from "@/generated/prisma/client";
import type { Role } from "@/generated/prisma/enums";
import type { PracticeContext } from "@/lib/auth/access";
import { can, invitableRoles } from "@/lib/auth/permissions";
import { isUuid, prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/domain/labels";
import { getEmailSender, type EmailMessage, type EmailSender } from "@/lib/email/sender";
import { appBaseUrl } from "@/lib/env";
import { TERMS_VERSION } from "@/lib/legal/terms";
import { UsersError } from "./errors";

/**
 * Invitations by email (PRD 3, req. 3; D-38). The link carries a random token and
 * the database keeps only its SHA-256, so a leaked table does not open accounts.
 * An invitation is valid for 7 days and works once. The first access asks for a
 * name, a password and the terms; someone who already has a login just accepts.
 */

export const INVITATION_TTL_DAYS = 7;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 86_400_000;

export type InvitationStatus = "pending" | "expired" | "used" | "revoked";

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isValidEmail(email: string) {
  return EMAIL.test(email);
}

export function invitationLink(baseUrl: string, token: string) {
  return `${baseUrl}/convite/${token}`;
}

/** invitedBy is null on the operator's invitation of a first admin (D-93), which nobody signs. */
export function invitationEmail(input: { to: string; practiceName: string; invitedBy: string | null; roleLabel: string; token: string; baseUrl: string }): EmailMessage {
  return {
    to: input.to,
    subject: `Convite para a agenda de ${input.practiceName}`,
    text: [
      "Olá!",
      "",
      `${input.invitedBy ? `${input.invitedBy} convidou você` : "Você foi convidado"} para a agenda de ${input.practiceName} como ${input.roleLabel}.`,
      "",
      `Para criar seu acesso, abra o link abaixo. Ele vale por ${INVITATION_TTL_DAYS} dias e só pode ser usado uma vez.`,
      "",
      invitationLink(input.baseUrl, input.token),
      "",
      "Se você não esperava este convite, ignore este e-mail.",
    ].join("\n"),
  };
}

function statusOf(invitation: Pick<Invitation, "acceptedAt" | "revokedAt" | "expiresAt">, now = new Date()): InvitationStatus {
  if (invitation.acceptedAt) return "used";
  if (invitation.revokedAt) return "revoked";
  if (invitation.expiresAt <= now) return "expired";
  return "pending";
}

export async function createInvitation(
  { user, access, db }: PracticeContext,
  input: { email: string; role: Role; professionalId?: string | null },
  deps: { emailSender?: EmailSender; baseUrl?: string } = {},
) {
  if (!can(access.role, "users:invite") || !invitableRoles(access.role).includes(input.role)) {
    throw new UsersError("role_not_allowed", `${access.role} cannot invite ${input.role}`);
  }
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) throw new UsersError("invalid_email", "Invalid email");

  let professionalId: string | null = null;
  if (input.role === "PROFESSIONAL") {
    if (!input.professionalId) throw new UsersError("professional_required", "A professional invitation needs a professional");
    const professional = isUuid(input.professionalId)
      ? await db.professional.findUnique({ where: { id: input.professionalId } })
      : null;
    if (!professional || professional.userId || !professional.active) {
      throw new UsersError("professional_unavailable", "Professional not found or already linked to a user");
    }
    professionalId = professional.id;
  }

  const activeMember = await db.membership.findFirst({ where: { revokedAt: null, user: { email } } });
  if (activeMember) throw new UsersError("already_member", "Already a member of the practice");

  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const invitation = await db.$transaction(async (tx) => {
    // A new invitation replaces the pending one for the same email.
    await tx.invitation.updateMany({
      where: { email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const created = await tx.invitation.create({
      data: {
        practiceId: access.practiceId,
        email,
        role: input.role,
        professionalId,
        tokenHash: hashInvitationToken(token),
        invitedByUserId: user.id,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS),
      },
    });
    await tx.auditEvent.create({
      data: {
        practiceId: access.practiceId,
        actorType: "USER",
        actorUserId: user.id,
        action: "invitation.created",
        entityType: "Invitation",
        entityId: created.id,
        changedFields: [],
      },
    });
    return created;
  });

  const baseUrl = deps.baseUrl ?? appBaseUrl();
  try {
    await (deps.emailSender ?? getEmailSender()).send(invitationEmail({ to: email, practiceName: access.practiceName, invitedBy: user.name, roleLabel: ROLE_LABELS[input.role], token, baseUrl }));
  } catch (error) {
    // Nobody received the link, so the invitation must not stay pending.
    await db.invitation.update({ where: { id: invitation.id }, data: { revokedAt: new Date() } });
    throw error;
  }
  return { invitationId: invitation.id, expiresAt: invitation.expiresAt };
}

export async function listPendingInvitations({ db }: PracticeContext) {
  return db.invitation.findMany({
    where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, role: true, expiresAt: true, professional: { select: { name: true } } },
  });
}

export async function revokeInvitation({ user, access, db }: PracticeContext, invitationId: string) {
  if (!can(access.role, "users:invite")) throw new UsersError("not_allowed", "Cannot manage invitations");
  const invitation = isUuid(invitationId) ? await db.invitation.findUnique({ where: { id: invitationId } }) : null;
  if (!invitation) throw new UsersError("not_found", "Invitation not found");
  if (!invitableRoles(access.role).includes(invitation.role)) {
    throw new UsersError("role_not_allowed", `${access.role} cannot manage ${invitation.role} invitations`);
  }
  await db.$transaction(async (tx) => {
    const { count } = await tx.invitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) return;
    await tx.auditEvent.create({
      data: {
        practiceId: access.practiceId,
        actorType: "USER",
        actorUserId: user.id,
        action: "invitation.revoked",
        entityType: "Invitation",
        entityId: invitation.id,
        changedFields: ["revokedAt"],
      },
    });
  });
}

// ---------------------------------------------------------------------------
// The invitation link. The token is the authorization and names the practice, so
// these functions use the base client: they run before anyone is signed in and
// create the login together with its first practice link.
// ---------------------------------------------------------------------------

async function findInvitation(token: string) {
  return prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    include: { practice: { select: { name: true } } },
  });
}

/** What the invitation page shows. */
export async function getInvitation(token: string) {
  const invitation = await findInvitation(token);
  if (!invitation) return null;
  const hasAccount = invitation.email ? (await prisma.user.count({ where: { email: invitation.email } })) > 0 : false;
  return {
    practiceName: invitation.practice.name,
    role: invitation.role,
    organizationAdmin: invitation.organizationAdmin,
    email: invitation.email,
    status: statusOf(invitation),
    hasAccount,
  };
}

async function findPendingInvitation(token: string) {
  const invitation = await findInvitation(token);
  if (!invitation || !invitation.email) throw new UsersError("not_found", "Invitation not found");
  const status = statusOf(invitation);
  if (status !== "pending") throw new UsersError(status, `Invitation is ${status}`);
  return { ...invitation, email: invitation.email };
}

type PendingInvitation = Awaited<ReturnType<typeof findPendingInvitation>>;

/** Marks the invitation used, unless a concurrent request already did. */
async function consume(tx: Prisma.TransactionClient, invitation: PendingInvitation, now: Date) {
  const { count } = await tx.invitation.updateMany({
    where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { acceptedAt: now },
  });
  if (count !== 1) throw new UsersError("used", "Invitation was used concurrently");
}

async function joinPractice(tx: Prisma.TransactionClient, invitation: PendingInvitation, userId: string) {
  const { practiceId, role } = invitation;
  await tx.membership.upsert({
    where: { practiceId_userId: { practiceId, userId } },
    create: { practiceId, userId, role },
    update: { role, revokedAt: null },
  });
  if (invitation.professionalId) {
    const { count } = await tx.professional.updateMany({
      where: { id: invitation.professionalId, practiceId, userId: null },
      data: { userId },
    });
    if (count !== 1) throw new UsersError("professional_unavailable", "Professional already linked to a user");
  }
  if (invitation.organizationAdmin) {
    const { organizationId } = await tx.practice.findUniqueOrThrow({ where: { id: practiceId }, select: { organizationId: true } });
    const member = await tx.organizationMember.upsert({
      where: { organizationId_userId: { organizationId, userId } },
      create: { organizationId, userId, role: "ADMIN" },
      update: { role: "ADMIN", revokedAt: null },
    });
    await tx.auditEvent.create({
      data: { practiceId, actorType: "USER", actorUserId: userId, action: "organization_admin.added", entityType: "OrganizationMember", entityId: member.id, changedFields: ["role"] },
    });
  }
  await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedUserId: userId } });
  await tx.auditEvent.create({
    data: {
      practiceId,
      actorType: "USER",
      actorUserId: userId,
      action: "invitation.accepted",
      entityType: "Invitation",
      entityId: invitation.id,
      changedFields: [],
    },
  });
}

/** First access: creates the user with a password, after the terms are accepted. */
export async function acceptInvitationAsNewUser(
  token: string,
  input: { name: string; password: string; acceptTerms: boolean },
) {
  const invitation = await findPendingInvitation(token);
  const name = input.name.trim();
  if (!name) throw new UsersError("name_required", "Name is required");
  if (input.password.length < MIN_PASSWORD_LENGTH || input.password.length > MAX_PASSWORD_LENGTH) {
    throw new UsersError("weak_password", "Password length out of range");
  }
  if (!input.acceptTerms) throw new UsersError("terms_required", "Terms must be accepted");
  if (await prisma.user.findUnique({ where: { email: invitation.email } })) {
    throw new UsersError("account_exists", "A user with this email already exists");
  }

  const passwordHash = await hashPassword(input.password);
  const now = new Date();
  const userId = await prisma.$transaction(async (tx) => {
    await consume(tx, invitation, now);
    // The link proved the email, which also lets a later Google sign-in join this user.
    const user = await tx.user.create({
      data: { name, email: invitation.email, emailVerified: true, termsAcceptedAt: now, termsVersion: TERMS_VERSION },
    });
    // Better Auth's password login: provider "credential", accountId = user id.
    await tx.account.create({
      data: { userId: user.id, providerId: "credential", accountId: user.id, password: passwordHash },
    });
    await joinPractice(tx, invitation, user.id);
    return user.id;
  });
  return { userId, practiceId: invitation.practiceId, email: invitation.email };
}

/** A signed-in user with the invited email joins one more practice. */
export async function acceptInvitationAsExistingUser(token: string, user: { id: string; email: string }) {
  const invitation = await findPendingInvitation(token);
  if (normalizeEmail(user.email) !== invitation.email) {
    throw new UsersError("email_mismatch", "Invitation is for another email");
  }
  await prisma.$transaction(async (tx) => {
    await consume(tx, invitation, new Date());
    await joinPractice(tx, invitation, user.id);
  });
  return { practiceId: invitation.practiceId };
}
