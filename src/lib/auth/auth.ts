import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { keepAliveAfterResponse } from "@/lib/after-response";
import { prisma } from "@/lib/db";
import { getEmailSender } from "@/lib/email/sender";
import { appBaseUrl, appOrigins } from "@/lib/env";
import { isTwoFactorRequired } from "./access";
import { challengeGoogleSignIn } from "./google-two-factor";
import { rememberedDevice } from "./remembered-device";

/**
 * Better Auth (D-35 to D-37). Authentication is cross-practice by definition, so
 * the adapter uses the base Prisma client; practice data is never read here.
 */

export const APP_NAME = "Agenda";

/** How long the link of "Esqueci minha senha" lasts (D-88). */
export const PASSWORD_RESET_SECONDS = 60 * 60;

/** Web session: expires after 12 h without activity (D-17). */
export const SESSION_IDLE_SECONDS = 12 * 60 * 60;
/** How often activity pushes the expiry forward; the idle limit lands within this margin. */
const SESSION_RENEW_AFTER_SECONDS = 10 * 60;

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/** Without credentials the provider stays off and the login page hides the button. */
export const googleSignInEnabled = Boolean(googleClientId && googleClientSecret);

/** Identity only (D-01). The calendar grant is the separate flow of Block 6. */
const socialProviders =
  googleClientId && googleClientSecret
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          // Only invitations create users (D-38): an unknown Google email is refused.
          disableImplicitSignUp: true,
          // Otherwise Google would add scopes granted earlier to this client.
          includeGrantedScopes: false,
        },
      }
    : {};

/** Sign-in needs no provider token, and the calendar token lives in GoogleConnection (D-01). */
function withoutProviderTokens<T extends object>(account: T) {
  return {
    data: {
      ...account,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    },
  };
}

/** D-36: a user cannot switch two-factor off while a practice they reach requires it. */
const keepRequiredTwoFactor = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/two-factor/disable") return;
  const session = await getSessionFromCtx(ctx);
  if (session && (await isTwoFactorRequired(session.user.id))) {
    throw new APIError("FORBIDDEN", {
      code: "TWO_FACTOR_REQUIRED_BY_PRACTICE",
      message: "Uma das suas contas exige verificação em duas etapas.",
    });
  }
});

/**
 * The attempts limit of /api/auth, in the database (D-96): a serverless instance's memory
 * dies with it, so a counter there would start over on every instance. Better Auth's rules
 * stay: 3 sign-ins every 10 s by address, and the 2FA plugin's and the password link's own.
 * Reading the session stays out: the PWA asks every minute, and each count is two queries.
 */
export const AUTH_RATE_LIMIT = {
  storage: "database",
  modelName: "rateLimit",
  customRules: { "/get-session": false },
} as const;

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: appBaseUrl(),
  trustedOrigins: appOrigins(),
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    // Better Auth generates no id; the database schema does (D-34).
    database: { generateId: "uuid" },
    // The e-mail of "Esqueci minha senha" goes out after the answer: otherwise the time
    // Gmail takes would tell whether the account exists (D-88, D-90).
    backgroundTasks: { handler: keepAliveAfterResponse },
  },
  telemetry: { enabled: false },
  rateLimit: AUTH_RATE_LIMIT,
  emailAndPassword: {
    enabled: true,
    // Users come only from invitations (D-38).
    disableSignUp: true,
    // "Esqueci minha senha" (D-88): the answer is the same whether or not the email has
    // an account, the link works once, and a new password ends the other sessions.
    resetPasswordTokenExpiresIn: PASSWORD_RESET_SECONDS,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await getEmailSender().send({
        to: user.email,
        subject: "Criar senha nova na Agenda",
        text: `Recebemos um pedido para criar uma senha nova para ${user.email}.\n\nAbra este link em até 1 hora:\n${url}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`,
      });
    },
  },
  socialProviders,
  account: {
    // A Google login joins the invited user with the same email; invitations
    // create users with a verified email, which linking requires.
    accountLinking: { enabled: true },
  },
  session: {
    expiresIn: SESSION_IDLE_SECONDS,
    updateAge: SESSION_RENEW_AFTER_SECONDS,
    // 30 days on a remembered device of the PWA (D-17, D-77).
    additionalFields: {
      rememberedDevice: { type: "boolean", required: false, input: false, defaultValue: false },
    },
  },
  user: {
    additionalFields: {
      termsAcceptedAt: { type: "date", required: false, input: false },
      termsVersion: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    account: {
      create: { before: async (account) => withoutProviderTokens(account) },
      update: { before: async (account) => withoutProviderTokens(account) },
    },
  },
  hooks: {
    before: keepRequiredTwoFactor,
    after: challengeGoogleSignIn,
  },
  // nextCookies() must stay last: it copies the cookies of every call into Next.js.
  plugins: [twoFactor({ issuer: APP_NAME }), rememberedDevice(), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
