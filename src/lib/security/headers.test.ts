import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, createNonce, SECURITY_HEADERS } from "./headers";

// The security headers of PRD 7 (D-102). The policy is built per request, with a nonce,
// so an injected script does not run, and the rest goes on every answer.

function directives(policy: string) {
  return new Map(policy.split(";").map((directive) => {
    const [name, ...values] = directive.trim().split(/\s+/);
    return [name, values] as const;
  }));
}

describe("contentSecurityPolicy", () => {
  const policy = directives(contentSecurityPolicy("abc123"));

  it("runs only the scripts that carry this answer's nonce, never inline ones without it", () => {
    expect(policy.get("script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(policy.get("script-src")).not.toContain("'unsafe-inline'");
    expect(policy.get("script-src")).not.toContain("'unsafe-eval'");
  });

  it("does not let the page be framed, or a form post somewhere else", () => {
    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'self'", "https://accounts.google.com"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
  });

  it("keeps the data on this origin: nothing to send it to, and nothing loaded from outside", () => {
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(policy.get("connect-src")).toEqual(["'self'"]);
    expect(policy.get("font-src")).toEqual(["'self'"]);
    expect(policy.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("allows the service worker and the manifest of the PWA (D-76)", () => {
    expect(policy.get("worker-src")).toEqual(["'self'"]);
    expect(policy.get("manifest-src")).toEqual(["'self'"]);
  });

  it("only development gets eval and the reload socket, which React and Next need there", () => {
    const development = directives(contentSecurityPolicy("abc123", { development: true }));
    expect(development.get("script-src")).toContain("'unsafe-eval'");
    expect(development.get("connect-src")).toEqual(["'self'", "ws:"]);
  });
});

describe("createNonce", () => {
  it("is different on every call, and fits a header", () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(nonce).toMatch(/^[A-Za-z0-9+/=]{20,}$/);
  });
});

describe("SECURITY_HEADERS", () => {
  const headers = new Map(SECURITY_HEADERS.map(({ key, value }) => [key.toLowerCase(), value]));

  it("has the ones every answer carries", () => {
    expect(headers.get("strict-transport-security")).toBe("max-age=63072000");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });

  it("turns off what the app does not use, and leaves the notices of the PWA alone (D-78)", () => {
    const policy = headers.get("permissions-policy")!;
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) expect(policy).toContain(`${feature}=()`);
    expect(policy).not.toContain("notifications");
    expect(policy).not.toContain("push");
  });
});
