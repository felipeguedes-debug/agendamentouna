/**
 * The security headers of PRD 7 (D-102). No imports: next.config.ts reads this file too.
 *
 * The policy depends on the request, so src/proxy.ts sets it, with a new nonce per answer:
 * Next finds the nonce in the header and marks its own scripts, and a script injected into
 * a page does not have it, so it does not run. Inline styles stay allowed, because Radix and
 * the style attributes of the screens use them. It also leaves nowhere to send data to.
 * Everything else goes on every answer, from next.config.ts.
 */

export const SECURITY_HEADERS = [
  // Without includeSubDomains: the app's domain may share its parent with other sites.
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  // Invitation and password links carry a token in the path: only the origin may leave.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
] as const;

export function createNonce() {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

export function contentSecurityPolicy(nonce: string, options: { development?: boolean } = {}) {
  const { development = false } = options;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws:" : ""}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // A form that redirects counts too: "Vincular Google Agenda" ends on Google's consent.
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
  ].join("; ");
}
