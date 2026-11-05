import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PRIVACY_VERSION } from "@/lib/legal/privacy";
import HomePage from "./inicio/page";
import PrivacyPage from "./privacidade/page";

// The public pages that Google's verification asks for (D-99): a home page that says what
// the app does, and a privacy policy on the same site. The text is provisional, like
// /termos (D-38), and says so: nobody should take it for the final legal text.

const home = renderToStaticMarkup(HomePage());
const privacy = renderToStaticMarkup(PrivacyPage());

describe("the home page", () => {
  it("says what the app is and that it uses Google Agenda and WhatsApp", () => {
    expect(home).toContain("Agenda");
    expect(home).toContain("Google Agenda");
    expect(home).toContain("WhatsApp");
  });

  it("links to the login, the privacy policy and the terms", () => {
    for (const path of ['href="/login"', 'href="/privacidade"', 'href="/termos"']) expect(home).toContain(path);
  });

  it("offers no way to sign up: users come only from invitations (D-38)", () => {
    expect(home).toContain("convite");
    expect(home).not.toMatch(/cadastre-se|crie sua conta/i);
  });
});

describe("the privacy policy", () => {
  it("is marked as provisional, with its version", () => {
    expect(privacy).toContain("Texto provisório");
    expect(PRIVACY_VERSION).toContain("provisorio");
    expect(privacy).toContain(PRIVACY_VERSION);
  });

  it("says what it does with the Google data, as the verification asks", () => {
    expect(privacy).toContain("Google Agenda");
    expect(privacy).toContain("Política de Dados do Usuário dos Serviços de API do Google");
    expect(privacy).toContain("Uso Limitado");
    expect(privacy).toMatch(/não (são )?copia/i);
    expect(privacy).toMatch(/desvincular/i);
  });

  it("names the operators of PRD 7 and the ones of this publication", () => {
    for (const operator of ["WhatsAPI", "SynkronosCRM", "Google", "Apple", "Mozilla", "Vercel", "Supabase", "Inngest"]) expect(privacy, operator).toContain(operator);
  });

  it("covers the data subject's rights, which the practice answers (D-49)", () => {
    expect(privacy).toMatch(/exclusão/i);
    expect(privacy).toMatch(/exportação/i);
  });

  it("leaves no invented contact: that comes with the final text", () => {
    expect(privacy).not.toContain("@");
    expect(privacy).toMatch(/canal de contato/i);
  });

  it("links back to the home page and the terms", () => {
    expect(privacy).toContain('href="/"');
    expect(privacy).toContain('href="/termos"');
  });
});
