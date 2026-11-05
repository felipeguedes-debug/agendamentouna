import { createHash, randomBytes } from "node:crypto";
import type { PracticeContext } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { decryptSecret, encryptSecret, sameSecret } from "@/lib/crypto/secrets";
import { forPractice, isUuid, prisma } from "@/lib/db";
import { AgendaError } from "@/lib/agenda/errors";
import { getEmailSender, type EmailSender } from "@/lib/email/sender";
import { detachProfessional, dropConnectionIfUnused, googleApiFor } from "./connection";
import { appBaseUrl } from "@/lib/env";
import { allowedGoogleAccounts, googleMode, googleProvider, googleRedirectUri, type GoogleSyncOptions } from "./index";
import { CALENDAR_SCOPES } from "./provider";
import { requestConnectionSync } from "./queue";

/**
 * The Google link (PRD 5, Vínculo; D-01, D-04, D-59), separate from sign-in:
 *
 * 1. a link request: the manager emails one to the professional (7 days, used
 *    once, only the token's SHA-256 stored, as the invitation of D-38), or the
 *    professional starts one from their profile (30 minutes);
 * 2. /api/google/oauth/start opens Google's consent with the calendar scopes,
 *    PKCE and a state, kept in an encrypted cookie for 10 minutes;
 * 3. /api/google/oauth/callback checks the state, exchanges the code and links
 *    the Google account to the professional, the refresh token encrypted.
 *
 * The consent is always the Google account owner's. The link request is the
 * authorization, so this service finds it through the base client, as the
 * invitation does, and writes the practice's rows through its scoped client.
 */

export const GOOGLE_LINK_COOKIE = "agenda.google_link";
export const LINK_TTL_MS = 7 * 86_400_000;
const OWN_LINK_TTL_MS = 30 * 60_000;
const STATE_TTL_MS = 10 * 60_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type GoogleLinkErrorCode = "invalid_link" | "invalid_state" | "denied" | "missing_scopes" | "account_not_allowed" | "google_error";

/** What the callback shows when the link does not go through. */
export const GOOGLE_LINK_ERROR_TEXT: Record<GoogleLinkErrorCode, string> = {
  invalid_link: "Este link de vínculo venceu ou já foi usado. Peça um novo ao consultório.",
  invalid_state: "A autorização não pôde ser conferida. Comece de novo pelo link de vínculo.",
  denied: "A autorização foi cancelada no Google. Nada foi vinculado.",
  missing_scopes: "Para vincular, marque todos os acessos pedidos na tela do Google.",
  account_not_allowed: "Esta conta Google não está liberada neste ambiente de teste.",
  google_error: "O Google não respondeu como esperado. Tente de novo em alguns minutos.",
};

export class GoogleLinkError extends Error {
  override name = "GoogleLinkError";
  constructor(readonly code: GoogleLinkErrorCode) {
    super(code);
  }
}

type StatePayload = { requestId: string; state: string; verifier: string; expiresAt: number };

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function linkUrl(token: string) {
  return new URL(`/google/vincular/${token}`, appBaseUrl()).toString();
}

export async function sendGoogleLink(
  { user, access, db }: PracticeContext,
  input: { professionalId: string; email?: string | null },
  deps: { emailSender?: EmailSender; now?: Date } = {},
) {
  if (!can(access.role, "google:send-link")) throw new AgendaError("not_allowed", "Cannot send the Google link");
  const now = deps.now ?? new Date();
  const professional = isUuid(input.professionalId) ? await db.professional.findFirst({ where: { id: input.professionalId, active: true } }) : null;
  if (!professional) throw new AgendaError("professional_unavailable", "Professional not found");
  const typed = input.email?.trim().toLowerCase() || null;
  const loginEmail = professional.userId ? (await db.user.findFirst({ where: { id: professional.userId }, select: { email: true } }))?.email : null;
  const email = typed ?? loginEmail ?? null;
  if (!email) throw new AgendaError("email_required", "The professional has no login");
  if (!EMAIL.test(email)) throw new AgendaError("invalid_email", "Invalid email");

  const token = randomToken();
  await db.$transaction(async (tx) => {
    await tx.googleLinkRequest.create({
      data: { practiceId: access.practiceId, professionalId: professional.id, tokenHash: hashToken(token), sentToEmail: email, createdByUserId: user.id, expiresAt: new Date(now.getTime() + LINK_TTL_MS) },
    });
    await tx.auditEvent.create({
      data: { practiceId: access.practiceId, actorType: "USER", actorUserId: user.id, action: "google_link.sent", entityType: "Professional", entityId: professional.id, changedFields: [] },
    });
  });
  const url = linkUrl(token);
  await (deps.emailSender ?? getEmailSender()).send({
    to: email,
    subject: `Vincule seu Google Agenda à agenda de ${access.practiceName}`,
    text: [
      "Olá,",
      "",
      `${access.practiceName} pede acesso ao Google Agenda de ${professional.name} para mostrar os atendimentos num calendário próprio, "${access.practiceName}", e para trazer os seus compromissos do Google como horários ocupados (só o horário, sem o conteúdo).`,
      "",
      "Para autorizar, abra o link abaixo e entre com a sua conta Google:",
      url,
      "",
      "O link vale por 7 dias e funciona uma vez.",
    ].join("\n"),
  });
  return { url, sentTo: email };
}

/** The professional links their own Google from the profile: a short request for the same flow. */
export async function createOwnLinkRequest({ user, access, db }: PracticeContext, now = new Date()) {
  if (!can(access.role, "google:link-own")) throw new AgendaError("not_allowed", "Only the professional links their own Google");
  const professional = await db.professional.findFirst({ where: { userId: user.id, active: true } });
  if (!professional) throw new AgendaError("professional_unavailable", "No professional record");
  const token = randomToken();
  await db.googleLinkRequest.create({
    data: { practiceId: access.practiceId, professionalId: professional.id, tokenHash: hashToken(token), createdByUserId: user.id, expiresAt: new Date(now.getTime() + OWN_LINK_TTL_MS) },
  });
  return token;
}

async function findRequest(where: { tokenHash: string } | { id: string }) {
  // Base client: the token is the authorization (see the module comment).
  return prisma.googleLinkRequest.findUnique({
    where,
    include: { practice: { select: { name: true } }, professional: { select: { name: true, active: true, userId: true } } },
  });
}

/** For the public page of the link: whose agenda, and whether it still works. */
export async function describeLinkRequest(token: string, now = new Date()) {
  const request = token ? await findRequest({ tokenHash: hashToken(token) }) : null;
  if (!request) return null;
  const status = request.usedAt ? "used" : request.expiresAt <= now || !request.professional.active ? "expired" : "pending";
  return { status, practiceName: request.practice.name, professionalName: request.professional.name } as const;
}

/** Opens Google's consent for the request: the URL to go to and the cookie that keeps state and PKCE. */
export async function beginGoogleLink(token: string, options: GoogleSyncOptions = {}) {
  const now = options.now ?? new Date();
  const request = token ? await findRequest({ tokenHash: hashToken(token) }) : null;
  if (!request || request.usedAt || request.expiresAt <= now || !request.professional.active) throw new GoogleLinkError("invalid_link");
  const loginEmail = request.professional.userId
    ? // Base client: the person who opens the link may not be signed in.
      (await prisma.user.findUnique({ where: { id: request.professional.userId }, select: { email: true } }))?.email
    : undefined;
  const state = randomToken();
  const verifier = randomToken();
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
  const url = (options.provider ?? googleProvider()).authorizationUrl({
    state,
    codeChallenge,
    redirectUri: googleRedirectUri(),
    loginHint: request.sentToEmail ?? loginEmail ?? undefined,
  });
  const payload: StatePayload = { requestId: request.id, state, verifier, expiresAt: now.getTime() + STATE_TTL_MS };
  return { url, cookie: encryptSecret(JSON.stringify(payload)) };
}

function readState(cookie: string | undefined, now: Date): StatePayload {
  try {
    const payload = JSON.parse(decryptSecret(cookie ?? "")) as StatePayload;
    if (typeof payload.state === "string" && typeof payload.requestId === "string" && payload.expiresAt > now.getTime()) return payload;
  } catch {
    // Falls through.
  }
  throw new GoogleLinkError("invalid_state");
}

/**
 * Google's answer (the callback): checks the state, takes the grant and links the
 * account to the professional. Refused: a consent without every calendar scope,
 * and, outside production, an account not in GOOGLE_ALLOWED_ACCOUNTS; what Google
 * gave is revoked. A link to another account moves the professional to it.
 */
export async function completeGoogleLink(input: { cookie?: string; state?: string | null; code?: string | null; error?: string | null }, options: GoogleSyncOptions = {}) {
  const now = options.now ?? new Date();
  const provider = options.provider ?? googleProvider();
  const payload = readState(input.cookie, now);
  if (!input.state || !sameSecret(input.state, payload.state)) throw new GoogleLinkError("invalid_state");
  if (input.error) throw new GoogleLinkError("denied");
  if (!input.code) throw new GoogleLinkError("invalid_state");
  const request = await findRequest({ id: payload.requestId });
  if (!request || request.usedAt || request.expiresAt <= now || !request.professional.active) throw new GoogleLinkError("invalid_link");

  let grant: Awaited<ReturnType<typeof provider.exchangeCode>>;
  try {
    grant = await provider.exchangeCode({ code: input.code, codeVerifier: payload.verifier, redirectUri: googleRedirectUri() });
  } catch (error) {
    console.warn("Google refused the link's code", (error as Error).message);
    throw new GoogleLinkError("google_error");
  }
  const refuse = async (code: GoogleLinkErrorCode) => {
    await provider.revoke(grant.refreshToken).catch(() => undefined);
    return new GoogleLinkError(code);
  };
  if (CALENDAR_SCOPES.some((scope) => !grant.scopes.includes(scope))) throw await refuse("missing_scopes");
  const allowed = googleMode() === "google" ? allowedGoogleAccounts() : undefined;
  if (allowed && !allowed.includes(grant.email.toLowerCase())) throw await refuse("account_not_allowed");

  const db = forPractice(request.practiceId);
  const { count } = await db.googleLinkRequest.updateMany({ where: { id: request.id, usedAt: null }, data: { usedAt: now } });
  if (count === 0) throw await refuse("invalid_link");

  const tokens = {
    email: grant.email.toLowerCase(),
    refreshTokenEncrypted: encryptSecret(grant.refreshToken),
    accessTokenEncrypted: encryptSecret(grant.accessToken),
    accessTokenExpiresAt: grant.expiresAt,
    scopes: grant.scopes,
    status: "ACTIVE" as const,
    statusChangedAt: now,
    lastError: null,
  };
  // Base client: the connection belongs to the person, across practices (D-04).
  const connection = await prisma.googleConnection.upsert({
    where: { googleSubject: grant.subject },
    create: { googleSubject: grant.subject, userId: request.professional.userId, ...tokens },
    update: { ...tokens, ...(request.professional.userId ? { userId: request.professional.userId } : {}) },
  });

  const previous = await db.$transaction(async (tx) => {
    const professional = await tx.professional.findUniqueOrThrow({ where: { id: request.professionalId } });
    const moved = professional.googleConnectionId && professional.googleConnectionId !== connection.id ? professional.googleConnectionId : null;
    const oldSecondary = moved ? await detachProfessional(tx, professional.id, now) : null;
    await tx.professional.update({
      where: { id: professional.id },
      data: { googleConnectionId: connection.id, ...(moved ? { googleBusyCalendarIds: [], googleBusyCalendarsChosen: false } : {}) },
    });
    await tx.auditEvent.create({
      data: {
        practiceId: request.practiceId,
        actorType: "USER",
        actorUserId: request.createdByUserId,
        action: "professional.google_linked",
        entityType: "Professional",
        entityId: professional.id,
        changedFields: ["googleConnectionId"],
      },
    });
    return moved ? { connectionId: moved, secondaryId: oldSecondary } : null;
  });

  if (previous) {
    // The old account's calendar of this practice goes with the move, as on unlinking.
    if (previous.secondaryId) {
      await googleApiFor(previous.connectionId, { ...options, provider })
        .then((api) => api.deleteCalendar(previous.secondaryId!))
        .catch((error: Error) => console.warn(`Could not delete the old secondary calendar ${previous.secondaryId}`, error.message));
    }
    await dropConnectionIfUnused(previous.connectionId, { ...options, provider });
  }
  await requestConnectionSync(connection.id);
  return {
    practiceId: request.practiceId,
    professionalId: request.professionalId,
    returnTo: request.sentToEmail ? "/google/vincular/concluido" : `/conta/${request.practiceId}/perfil?google=vinculado`,
  };
}
