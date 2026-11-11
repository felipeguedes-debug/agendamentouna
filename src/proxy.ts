import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, createNonce } from "@/lib/security/headers";

/**
 * Optimistic check, as the Next.js guide asks of Proxy (D-40): a request to a
 * protected page without a session cookie goes to the login page. It reads no
 * database; the session, the practice and the role are checked by the data access
 * layer (src/lib/auth/guard.ts) in every page and Server Action.
 *
 * It also sets each page's security policy, with a nonce of that answer (D-102).
 */

// /google: the link the manager e-mails to the professional works without a login (D-59).
const PUBLIC_PREFIXES = ["/inicio", "/login", "/esqueci-senha", "/nova-senha", "/convite", "/termos", "/privacidade", "/google"];

function isPublic(pathname: string) {
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Next reads the nonce from the request's header, and the browser enforces the response's. */
function withPolicy(request: NextRequest, respond: (init: { request: { headers: Headers } }) => NextResponse) {
  const policy = contentSecurityPolicy(createNonce(), { development: process.env.NODE_ENV === "development" });
  const headers = new Headers(request.headers);
  headers.set("content-security-policy", policy);
  const response = respond({ request: { headers } });
  response.headers.set("content-security-policy", policy);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  // A visitor at / goes to the login, where the notice of the terms comes first; the public
  // home page that Google's verification opens is /inicio (D-99, D-106). Someone with a
  // session goes on to the page that picks their practice.
  if (isPublic(pathname) || hasSession) return withPolicy(request, (init) => NextResponse.next(init));

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Pages only: route handlers under /api authenticate themselves (Better Auth now,
  // webhooks with their own signatures later), and Next.js internals and files pass.
  matcher: ["/((?!api/|_next/static|_next/image|.*\\..*).*)"],
};
