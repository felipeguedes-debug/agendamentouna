import { headers } from "next/headers";
import { forbidden, notFound, redirect } from "next/navigation";
import { cache } from "react";
import { getPracticeAccess, isTwoFactorRequired, practiceContext, type PracticeContext, type SessionUser } from "./access";
import { auth } from "./auth";
import { can, type Permission } from "./permissions";

/**
 * Data access layer for authenticated pages and Server Actions (D-40). The proxy
 * only looks for a session cookie; the real checks happen here, close to the data:
 *
 * - no session: redirect to the login page;
 * - two-factor required by a practice and not set up: redirect to the security page (D-16);
 * - no access to the practice: 404, which does not reveal whether it exists (D-39);
 * - access without the permission: 403.
 *
 * The practice-scoped client comes out only after these checks.
 */

export const LOGIN_PATH = "/login";
export const SECURITY_PATH = "/seguranca";

export type CurrentUser = SessionUser & { twoFactorEnabled: boolean };

/**
 * Server Components cannot set cookies, so reads here never renew the session; the
 * session keep-alive renews it through the auth route handler (D-37).
 */
export const getCurrentSession = cache(async () =>
  auth.api.getSession({ headers: await headers(), query: { disableRefresh: true } }),
);

export async function requireUser(options: { allowMissingTwoFactor?: boolean } = {}): Promise<CurrentUser> {
  const session = await getCurrentSession();
  if (!session) redirect(LOGIN_PATH);
  const user: CurrentUser = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    twoFactorEnabled: Boolean(session.user.twoFactorEnabled),
  };
  if (!options.allowMissingTwoFactor && !user.twoFactorEnabled && (await isTwoFactorRequired(user.id))) {
    redirect(SECURITY_PATH);
  }
  return user;
}

export async function requirePracticeAccess(practiceId: string): Promise<PracticeContext> {
  const user = await requireUser();
  const access = await getPracticeAccess(user.id, practiceId);
  if (!access) notFound();
  return practiceContext(user, access);
}

/** A list means any of them, as in the "-own" variants ("agenda:view" or "agenda:view-own"). */
export async function requirePracticePermission(
  practiceId: string,
  permission: Permission | readonly Permission[],
): Promise<PracticeContext> {
  const context = await requirePracticeAccess(practiceId);
  const permissions: readonly Permission[] = typeof permission === "string" ? [permission] : permission;
  if (!permissions.some((candidate) => can(context.access.role, candidate))) forbidden();
  return context;
}
