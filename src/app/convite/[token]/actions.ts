"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { getCurrentSession } from "@/lib/auth/guard";
import { rememberPractice } from "@/lib/auth/last-practice";
import { USERS_ERROR_TEXT, UsersError } from "@/lib/users/errors";
import { acceptInvitationAsExistingUser, acceptInvitationAsNewUser } from "@/lib/users/invitations";

export type AcceptState = { error?: string };

/** First access (PRD 3, req. 3): name, password and terms, then the user is signed in. */
export async function acceptAsNewUser(token: string, _state: AcceptState, formData: FormData): Promise<AcceptState> {
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("passwordConfirmation") ?? "")) {
    return { error: "As senhas não conferem." };
  }
  let accepted: Awaited<ReturnType<typeof acceptInvitationAsNewUser>>;
  try {
    accepted = await acceptInvitationAsNewUser(token, {
      name: String(formData.get("name") ?? ""),
      password,
      acceptTerms: formData.get("acceptTerms") === "on",
    });
  } catch (error) {
    if (error instanceof UsersError) return { error: USERS_ERROR_TEXT[error.code] };
    throw error;
  }
  // The user was created a moment ago with this password; nextCookies() sets the cookie.
  await auth.api.signInEmail({ body: { email: accepted.email, password }, headers: await headers() });
  await rememberPractice(accepted.practiceId);
  redirect(`/conta/${accepted.practiceId}`);
}

/** Someone who already has a login adds the invited practice. */
export async function acceptAsExistingUser(token: string): Promise<AcceptState> {
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/convite/${token}`)}`);
  let practiceId: string;
  try {
    ({ practiceId } = await acceptInvitationAsExistingUser(token, session.user));
  } catch (error) {
    if (error instanceof UsersError) return { error: USERS_ERROR_TEXT[error.code] };
    throw error;
  }
  await rememberPractice(practiceId);
  redirect(`/conta/${practiceId}`);
}
