import { randomBytes } from "node:crypto";
import { isUuid, prisma } from "@/lib/db";
import { getEmailSender, type EmailSender } from "@/lib/email/sender";
import { appBaseUrl } from "@/lib/env";
import { TIME_ZONES } from "@/lib/locations/locations";
import { hashInvitationToken, INVITATION_TTL_DAYS, invitationEmail, invitationLink, isValidEmail, normalizeEmail } from "@/lib/users/invitations";

/**
 * The first account of an empty database (D-93), for the operator's `npm run conta:criar`:
 * users only come from invitations, invitations come from people who already have access,
 * and only this creates the first of them. It works across practices by definition, so it
 * goes through the base client, and it signs the audit trail as the system.
 */

export class OperatorError extends Error {
  override name = "OperatorError";
}

type Deps = { emailSender?: EmailSender; baseUrl?: string };

export type PracticeInput = { practice: string; location: string; address: string; timeZone: string };
export type FirstAccountInput = PracticeInput & { organization: string; email: string };

const DAY_MS = 86_400_000;

function required(value: string, what: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new OperatorError(`Informe ${what}.`);
  return trimmed;
}

function cleanEmail(value: string) {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) throw new OperatorError(`E-mail inválido: ${value}`);
  return email;
}

function cleanPractice(input: PracticeInput) {
  if (!TIME_ZONES.some((zone) => zone.value === input.timeZone)) {
    throw new OperatorError(`Fuso desconhecido: ${input.timeZone}. Use um destes: ${TIME_ZONES.map((zone) => zone.value).join(", ")}.`);
  }
  return {
    practice: required(input.practice, "o nome da conta"),
    location: required(input.location, "o nome da unidade"),
    address: required(input.address, "o endereço da unidade"),
    timeZone: input.timeZone,
  };
}

type Transaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const systemEvent = (practiceId: string, action: string, entityType: string, entityId: string, changedFields: string[]) => ({ practiceId, actorType: "SYSTEM" as const, action, entityType, entityId, changedFields });

async function createPracticeWithLocation(tx: Transaction, organizationId: string, input: ReturnType<typeof cleanPractice>) {
  const practice = await tx.practice.create({ data: { organizationId, name: input.practice } });
  const location = await tx.location.create({ data: { practiceId: practice.id, name: input.location, address: input.address, timeZone: input.timeZone } });
  await tx.auditEvent.createMany({
    data: [systemEvent(practice.id, "practice.created", "Practice", practice.id, ["name"]), systemEvent(practice.id, "location.created", "Location", location.id, ["name", "address", "timeZone"])],
  });
  return practice;
}

async function createAdminInvitation(tx: Transaction, practiceId: string, email: string, now: Date) {
  const token = randomBytes(32).toString("base64url");
  const invitation = await tx.invitation.create({
    data: { practiceId, email, role: "PRACTICE_MANAGER", organizationAdmin: true, tokenHash: hashInvitationToken(token), expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY_MS) },
  });
  await tx.auditEvent.create({ data: systemEvent(practiceId, "invitation.created", "Invitation", invitation.id, []) });
  return token;
}

/**
 * Nobody else can reach a practice with no one in it, so when the e-mail does not leave
 * the invitation stays and the link goes to the operator, who already holds the database.
 */
async function deliverInvitation(input: { email: string; practiceName: string; token: string }, deps: Deps) {
  const baseUrl = deps.baseUrl ?? appBaseUrl();
  try {
    await (deps.emailSender ?? getEmailSender()).send(invitationEmail({ to: input.email, practiceName: input.practiceName, invitedBy: null, roleLabel: "Admin da organização", token: input.token, baseUrl }));
    return { delivered: true, link: null };
  } catch (error) {
    console.error("The invitation e-mail did not leave:", (error as Error).message);
    return { delivered: false, link: invitationLink(baseUrl, input.token) };
  }
}

async function organizationsNamed(name: string) {
  return prisma.organization.findMany({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true, name: true } });
}

export async function createFirstAccount(input: FirstAccountInput, deps: Deps = {}, now = new Date()) {
  const organization = required(input.organization, "o nome da organização");
  const practiceInput = cleanPractice(input);
  const email = cleanEmail(input.email);
  if ((await organizationsNamed(organization)).length > 0) throw new OperatorError(`A organização "${organization}" já existe. Para acrescentar uma conta a ela, use --acrescentar.`);

  const created = await prisma.$transaction(async (tx) => {
    const { id: organizationId } = await tx.organization.create({ data: { name: organization } });
    const practice = await createPracticeWithLocation(tx, organizationId, practiceInput);
    return { organizationId, practiceId: practice.id, token: await createAdminInvitation(tx, practice.id, email, now) };
  });
  const delivery = await deliverInvitation({ email, practiceName: practiceInput.practice, token: created.token }, deps);
  return { organizationId: created.organizationId, practiceId: created.practiceId, ...delivery };
}

/** One more practice of an organization. Its admin reaches it at once (D-39). */
export async function addPracticeToOrganization(input: PracticeInput & { organization: string }) {
  const name = required(input.organization, "o nome da organização");
  const practiceInput = cleanPractice(input);
  const found = await organizationsNamed(name);
  if (found.length === 0) throw new OperatorError(`A organização "${name}" não existe.`);
  if (found.length > 1) throw new OperatorError(`Há mais de uma organização com o nome "${name}". Corrija no banco antes de seguir.`);
  const practice = await prisma.$transaction((tx) => createPracticeWithLocation(tx, found[0].id, practiceInput));
  return { organizationId: found[0].id, practiceId: practice.id };
}

/**
 * A new invitation for a practice whose organization still has no admin, as when the first
 * one expired: with nobody in, no screen can issue another. Once there is an admin, more
 * access goes through the screen, and this refuses, so a typo here never creates an admin.
 */
export async function reissueAdminInvitation(input: { practiceId: string; email: string }, deps: Deps = {}, now = new Date()) {
  const email = cleanEmail(input.email);
  const practice = isUuid(input.practiceId)
    ? await prisma.practice.findUnique({ where: { id: input.practiceId }, select: { id: true, name: true, organization: { select: { members: { where: { role: "ADMIN", revokedAt: null }, select: { id: true } } } } } })
    : null;
  if (!practice) throw new OperatorError("Conta não encontrada.");
  if (practice.organization.members.length > 0) throw new OperatorError("Esta organização já tem admin. Quem convida agora é ele, pela tela Usuários.");

  const token = await prisma.$transaction(async (tx) => {
    await tx.invitation.updateMany({ where: { practiceId: practice.id, organizationAdmin: true, acceptedAt: null, revokedAt: null }, data: { revokedAt: now } });
    return createAdminInvitation(tx, practice.id, email, now);
  });
  return deliverInvitation({ email, practiceName: practice.name, token }, deps);
}
