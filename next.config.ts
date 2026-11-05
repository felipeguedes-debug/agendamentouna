import type { NextConfig } from "next";
import { SECURITY_HEADERS } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // No cacheComponents (D-72): its shell sends the headers before the session check,
  // so forbidden(), notFound() and redirect() would all answer 200.
  // googleapis (Block 6) is large: loaded from node_modules at run time, not bundled.
  // web-push (Block 8) and nodemailer (D-90) likewise: only their real providers load them.
  serverExternalPackages: ["googleapis", "web-push", "nodemailer"],
  experimental: {
    // forbidden() for a role without permission (D-40).
    authInterrupts: true,
  },
  // The service worker and its offline page must never come from the HTTP cache, so a
  // new version reaches the phone at once (D-76).
  async headers() {
    return [
      // The policy with its nonce is set per request, in src/proxy.ts (D-102).
      { source: "/(.*)", headers: [...SECURITY_HEADERS] },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      { source: "/offline.html", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
