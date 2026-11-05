/** Session lengths the browser also needs, kept apart from the server's auth setup (D-17, D-77). */

export const REMEMBERED_SESSION_SECONDS = 30 * 24 * 60 * 60;

/** Below this, the keep-alive asks for the 30 days again: at most once a day. */
export const REMEMBERED_RENEW_BELOW_SECONDS = REMEMBERED_SESSION_SECONDS - 24 * 60 * 60;
