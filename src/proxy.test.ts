import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "./proxy";

// Optimistic check only (D-40): the proxy looks at the session cookie, never at the
// database; pages and Server Actions check the session and the role for real. It also
// gives each page the nonce of its security policy (D-102).

const SESSION_COOKIE = "better-auth.session_token=qualquer-valor";

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });
}

function passedThrough(response: Response) {
  return response.headers.get("x-middleware-next") === "1";
}

const policyOf = (response: Response) => response.headers.get("content-security-policy");
const policyForNext = (response: Response) => response.headers.get("x-middleware-request-content-security-policy");

describe("proxy", () => {
  it("sends a visitor without session cookie to the login page, remembering the page", () => {
    const response = proxy(request("/conta/abc/regua?semana=2"));
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/conta/abc/regua?semana=2");
  });

  it("shows a visitor the public home page at /, which Google's verification opens without a login (D-99)", () => {
    const response = proxy(request("/"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
    expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/inicio");
  });

  it("takes a request with a session cookie at / to the practices, not to the home page", () => {
    const response = proxy(request("/", SESSION_COOKIE));
    expect(passedThrough(response)).toBe(true);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("lets public pages through", () => {
    for (const path of ["/login", "/login/segundo-fator", "/esqueci-senha", "/nova-senha", "/convite/abc", "/termos", "/privacidade", "/inicio", "/google/vincular/abc", "/google/vincular/concluido"]) {
      expect(passedThrough(proxy(request(path))), path).toBe(true);
    }
  });

  it("lets a request with a session cookie through", () => {
    expect(passedThrough(proxy(request("/conta/abc/regua", SESSION_COOKIE)))).toBe(true);
  });

  describe("the security policy (D-102)", () => {
    it("goes on the answer and to Next, which reads the nonce from it to mark its own scripts", () => {
      for (const response of [proxy(request("/login")), proxy(request("/")), proxy(request("/conta/abc", SESSION_COOKIE))]) {
        const policy = policyOf(response);
        expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
        expect(policyForNext(response)).toBe(policy);
      }
    });

    it("has a new nonce on every answer", () => {
      expect(policyOf(proxy(request("/login")))).not.toBe(policyOf(proxy(request("/login"))));
    });

    it("is not needed on a redirect, which renders nothing", () => {
      expect(policyOf(proxy(request("/conta/abc")))).toBeNull();
    });
  });
});
