import { cookies } from "next/headers";

/**
 * The last practice the user chose, so "/" opens it (D-39). Only a preference:
 * every page checks the access again. Set from Server Actions, which can write cookies.
 */

export const LAST_PRACTICE_COOKIE = "agenda.ultima_conta";

export async function rememberPractice(practiceId: string) {
  (await cookies()).set(LAST_PRACTICE_COOKIE, practiceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

export async function lastPractice() {
  return (await cookies()).get(LAST_PRACTICE_COOKIE)?.value;
}
