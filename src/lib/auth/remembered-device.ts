import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { listProfessionalAccess } from "./access";
import { REMEMBERED_SESSION_SECONDS } from "./session-lengths";

/**
 * The remembered device of the PWA (D-17, D-77): on request, the session and its cookie
 * last 30 days from the last use instead of 12 h. The second factor still comes at every
 * login (D-36): this only keeps a session that already passed it. Better Auth has no
 * session length per session, hence the endpoint; the session keep-alive calls it again
 * as the app is used.
 */

export const rememberedDevice = () =>
  ({
    id: "remembered-device",
    endpoints: {
      rememberDevice: createAuthEndpoint("/remember-device", { method: "POST", use: [sessionMiddleware] }, async (ctx) => {
        const { session, user } = ctx.context.session;
        // A long session is for the professional's own phone, which shows a day's agenda,
        // not for the screens that reach every patient of a practice.
        if ((await listProfessionalAccess(user.id)).length === 0) {
          throw new APIError("FORBIDDEN", { code: "NOT_A_PROFESSIONAL", message: "Só o profissional mantém o aparelho conectado." });
        }
        const expiresAt = new Date(Date.now() + REMEMBERED_SESSION_SECONDS * 1000);
        const updated = await ctx.context.internalAdapter.updateSession(session.token, { expiresAt, rememberedDevice: true });
        if (!updated) throw new APIError("UNAUTHORIZED", { message: "Sessão encerrada." });
        await setSessionCookie(ctx, { session: updated, user }, false, { maxAge: REMEMBERED_SESSION_SECONDS });
        return ctx.json({ expiresAt });
      }),
    },
  }) satisfies BetterAuthPlugin;
