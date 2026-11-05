import { describe, expect, it } from "vitest";
import { renderTemplate, templateProblems, TEMPLATE_VARIABLES } from "./template";

// The text variables of PRD 6, filled in the location's time zone. {tipo} is the
// type's display name (D-14); {link_reagendar} is phase 2 and not available yet.

const values = {
  patientName: "Maria Souza Lima",
  professionalName: "Dr. Otávio Lemos",
  type: { displayName: null, category: "PROCEDURE" as const, preparation: "Trazer meias de compressão" },
  startsAt: new Date("2026-11-03T13:00:00Z"),
  timeZone: "America/Fortaleza",
  address: "Av. Santos Dumont, 1000 – Aldeota",
  priceCents: 80000,
};

describe("renderTemplate", () => {
  it("fills every variable", () => {
    const text = renderTemplate(
      "{primeiro_nome}, seu {tipo} com {profissional} é {data_extenso} às {hora}, em {endereco}. Preparo: {preparo}. Valor: {valor}.",
      values,
    );
    expect(text).toBe(
      "Maria, seu Procedimento com Dr. Otávio Lemos é terça-feira, 3 de novembro às 10:00, em Av. Santos Dumont, 1000 – Aldeota. Preparo: Trazer meias de compressão. Valor: R$ 800,00.",
    );
  });

  it("uses the location's time zone and the display name", () => {
    const text = renderTemplate("{tipo} {data_extenso} {hora}", { ...values, timeZone: "America/Manaus", type: { ...values.type, displayName: "Sessão" } });
    expect(text).toBe("Sessão terça-feira, 3 de novembro 09:00");
  });

  it("leaves an empty preparation empty", () => {
    expect(renderTemplate("Preparo: {preparo}.", { ...values, type: { ...values.type, preparation: null } })).toBe("Preparo: .");
  });
});

describe("templateProblems", () => {
  it("accepts the variables of PRD 6", () => {
    expect(templateProblems(TEMPLATE_VARIABLES.map((name) => `{${name}}`).join(" "))).toEqual([]);
  });

  it("names unknown variables, phase 2 included", () => {
    expect(templateProblems("Olá {nome}, remarque em {link_reagendar}")).toEqual(["unknown_variable:{nome}", "unknown_variable:{link_reagendar}"]);
  });

  it("requires text and limits its size", () => {
    expect(templateProblems("   ")).toEqual(["empty"]);
    expect(templateProblems("a".repeat(1001))).toEqual(["too_long"]);
  });
});
