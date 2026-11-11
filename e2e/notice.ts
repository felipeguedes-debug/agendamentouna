import { ENTRY_NOTICE_COOKIE, entryNoticeValue } from "../src/lib/legal/notice";

/**
 * The cookie of a device that agreed to the notice before the login (D-106). Every flow
 * starts with it (playwright.config.ts); a test that clears the cookies to sign in as
 * someone else puts it back, as the same device would keep it.
 */
export const AGREED_NOTICE = {
  name: ENTRY_NOTICE_COOKIE,
  value: entryNoticeValue(),
  domain: "localhost",
  path: "/",
  expires: -1,
  httpOnly: true,
  secure: false,
  sameSite: "Lax" as const,
};
