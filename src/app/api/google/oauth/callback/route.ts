import { NextResponse, type NextRequest } from "next/server";
import { completeGoogleLink, GOOGLE_LINK_COOKIE, GoogleLinkError } from "@/lib/google/link";

/**
 * Google's answer to the link's consent (PRD 5, Vínculo; D-59): the state must
 * match the cookie set by /api/google/oauth/start. The professional goes back to
 * their profile; whoever came from an e-mailed link sees the confirmation page.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  let target: string;
  try {
    const { returnTo } = await completeGoogleLink({
      cookie: request.cookies.get(GOOGLE_LINK_COOKIE)?.value,
      state: params.get("state"),
      code: params.get("code"),
      error: params.get("error"),
    });
    target = returnTo;
  } catch (error) {
    if (!(error instanceof GoogleLinkError)) throw error;
    target = `/google/vincular/concluido?erro=${error.code}`;
  }
  const response = NextResponse.redirect(new URL(target, request.url));
  response.cookies.delete({ name: GOOGLE_LINK_COOKIE, path: "/api/google/oauth" });
  return response;
}
