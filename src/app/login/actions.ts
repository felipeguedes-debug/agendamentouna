"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath, withNext } from "@/lib/auth/redirects";
import { ENTRY_NOTICE_COOKIE, ENTRY_NOTICE_MAX_AGE, entryNoticeValue } from "@/lib/legal/notice";

/**
 * "Li e concordo" on the notice before the login (D-106). The device keeps the versions it
 * agreed to, and the login opens on the page asked for. A form with no script of its own:
 * it works before React loads, and the security policy has nothing inline to refuse (D-102).
 */
export async function acceptEntryNotice(form: FormData) {
  (await cookies()).set(ENTRY_NOTICE_COOKIE, entryNoticeValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ENTRY_NOTICE_MAX_AGE,
  });
  const next = form.get("next");
  redirect(withNext("/login", safeNextPath(typeof next === "string" ? next : undefined)));
}
