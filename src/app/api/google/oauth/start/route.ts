import { NextResponse, type NextRequest } from "next/server";
import { beginGoogleLink, GOOGLE_LINK_COOKIE, GoogleLinkError } from "@/lib/google/link";

/**
 * Opens Google's consent for a link request (PRD 5, Vínculo; D-59). The token in
 * the query is the authorization, so no session is needed: the manager's e-mailed
 * link works for a professional without a login. The state and the PKCE verifier
 * go in an encrypted, httpOnly cookie that only the callback reads.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  try {
    const { url, cookie } = await beginGoogleLink(token);
    const response = NextResponse.redirect(url);
    response.cookies.set(GOOGLE_LINK_COOKIE, cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/google/oauth",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    if (!(error instanceof GoogleLinkError)) throw error;
    return NextResponse.redirect(new URL(`/google/vincular/concluido?erro=${error.code}`, request.url));
  }
}
