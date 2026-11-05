import { createAuthMiddleware } from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";

/**
 * Second factor for Google sign-in (D-36). The two-factor plugin only challenges
 * the password sign-in; an OAuth callback goes straight to a session. This hook
 * runs after the Google callback and, when the user has two-factor on, swaps the
 * new session for the same challenge the plugin builds for the password sign-in
 * (better-auth 1.7.14, dist/plugins/two-factor/index.mjs): the signed `two_factor`
 * cookie and the `2fa-…` verification rows. The plugin's verify endpoints then
 * finish the sign-in, with their attempt limit and lockout. better-auth is pinned
 * because of these internal names; auth.test.ts covers the whole flow.
 */

export const SECOND_FACTOR_PATH = "/login/segundo-fator";

const OAUTH_CALLBACK_ENDPOINT = "/callback/:id";
const TWO_FACTOR_COOKIE_NAME = "two_factor";
const TWO_FACTOR_COOKIE_MAX_AGE = 600;

export const challengeGoogleSignIn = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== OAUTH_CALLBACK_ENDPOINT) return;
  const created = ctx.context.newSession;
  if (!created || !(created.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) return;

  deleteSessionCookie(ctx, true);
  await ctx.context.internalAdapter.deleteSession(created.session.token);
  ctx.context.setNewSession(null);

  const cookie = ctx.context.createAuthCookie(TWO_FACTOR_COOKIE_NAME, { maxAge: TWO_FACTOR_COOKIE_MAX_AGE });
  const identifier = `2fa-${generateRandomString(20)}`;
  const expiresAt = new Date(Date.now() + TWO_FACTOR_COOKIE_MAX_AGE * 1000);
  await ctx.context.internalAdapter.createVerificationValue({ value: created.user.id, identifier, expiresAt });
  await ctx.context.internalAdapter.createVerificationValue({
    value: "0",
    identifier: `2fa-attempts-${identifier}`,
    expiresAt,
  });
  await ctx.setSignedCookie(cookie.name, identifier, ctx.context.secret, cookie.attributes);
  throw ctx.redirect(SECOND_FACTOR_PATH);
});
