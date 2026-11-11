import { PRIVACY_VERSION } from "./privacy";
import { TERMS_VERSION } from "./terms";

/**
 * The notice before the login (D-106): "Li e concordo" with the terms of use and the privacy
 * policy, once per device. The device keeps, in a cookie, the versions it agreed to, so a new
 * TERMS_VERSION or PRIVACY_VERSION brings the notice back. Nothing goes to the database: before
 * the login nobody is known, and each person's acceptance of the terms is the invitation's
 * (User.termsAcceptedAt and termsVersion, D-38).
 *
 * No Next import here: playwright.config.ts reads this module to start the flows with the
 * notice agreed.
 */

export const ENTRY_NOTICE_COOKIE = "agenda.aviso_aceito";

/** A year, as the last practice's cookie. */
export const ENTRY_NOTICE_MAX_AGE = 365 * 24 * 60 * 60;

/** Only letters, digits, dots and dashes: the browser sends it as it is, without encoding. */
export function entryNoticeValue(terms = TERMS_VERSION, privacy = PRIVACY_VERSION) {
  return `${terms}.${privacy}`;
}

export function entryNoticeAccepted(value: string | undefined) {
  return value === entryNoticeValue();
}
