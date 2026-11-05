import { describe, expect, it } from "vitest";
import { activeSegment, isSettingsSegment, mainSections, samePlaceIn, settingsGroups, visibleSections } from "./sections";

// The practice menu follows the permissions each page checks (D-40), grouped as in D-81.

const PRACTICE = "11111111-1111-1111-1111-111111111111";

const labels = (sections: readonly { label: string }[]) => sections.map((section) => section.label);
const groups = (role: Parameters<typeof settingsGroups>[0]) => settingsGroups(role).map((entry) => [entry.group, labels(entry.sections)]);

describe("practice sections", () => {
  it("keeps the daily work in the side menu", () => {
    expect(labels(mainSections("PRACTICE_MANAGER"))).toEqual(["Agenda", "Pendências", "Pacientes", "Indicadores"]);
    expect(labels(mainSections("SECRETARY"))).toEqual(["Agenda", "Pendências", "Pacientes"]);
    expect(labels(mainSections("PROFESSIONAL"))).toEqual(["Agenda", "Pendências"]);
  });

  it("groups the settings each role may open", () => {
    expect(groups("PRACTICE_MANAGER")).toEqual([
      ["Atendimento", ["Tipos de atendimento", "Régua de WhatsApp"]],
      ["Equipe", ["Profissionais", "Usuários"]],
      ["Consultório", ["Unidades e horários", "Segurança e integrações", "Saúde da operação", "Trilha de auditoria"]],
    ]);
    expect(groups("SECRETARY")).toEqual([["Atendimento", ["Tipos de atendimento"]]]);
    expect(groups("PROFESSIONAL")).toEqual([["Atendimento", ["Tipos de atendimento"]]]);
  });

  it("leaves the professional's profile in the user's menu", () => {
    expect(visibleSections("PROFESSIONAL").filter((section) => section.place === "user").map((section) => section.label)).toEqual(["Meu perfil"]);
    expect(visibleSections("PRACTICE_MANAGER").some((section) => section.place === "user")).toBe(false);
  });

  it("lights up Configurações on the hub and on the screens under it", () => {
    expect(isSettingsSegment("configuracoes")).toBe(true);
    expect(isSettingsSegment("unidades")).toBe(true);
    expect(isSettingsSegment("pacientes")).toBe(false);
    expect(isSettingsSegment(null)).toBe(false);
  });

  it("treats the appointment pages as part of the agenda", () => {
    expect(activeSegment("agendamentos")).toBeNull();
    expect(activeSegment("tipos")).toBe("tipos");
    expect(samePlaceIn(PRACTICE, "SECRETARY", "agendamentos")).toBe(`/conta/${PRACTICE}`);
    expect(samePlaceIn(PRACTICE, "SECRETARY", "tipos")).toBe(`/conta/${PRACTICE}/tipos`);
    expect(samePlaceIn(PRACTICE, "SECRETARY", "regua")).toBe(`/conta/${PRACTICE}`);
    expect(samePlaceIn(PRACTICE, "SECRETARY", "pacientes")).toBe(`/conta/${PRACTICE}/pacientes`);
    expect(samePlaceIn(PRACTICE, "PROFESSIONAL", "pacientes")).toBe(`/conta/${PRACTICE}`);
    expect(samePlaceIn(PRACTICE, "SECRETARY", "pendencias")).toBe(`/conta/${PRACTICE}/pendencias`);
    expect(samePlaceIn(PRACTICE, "PROFESSIONAL", "pendencias")).toBe(`/conta/${PRACTICE}/pendencias`);
    expect(samePlaceIn(PRACTICE, "SECRETARY", "profissionais")).toBe(`/conta/${PRACTICE}`);
    expect(samePlaceIn(PRACTICE, "PRACTICE_MANAGER", "profissionais")).toBe(`/conta/${PRACTICE}/profissionais`);
    expect(samePlaceIn(PRACTICE, "SECRETARY", "indicadores")).toBe(`/conta/${PRACTICE}`);
    expect(samePlaceIn(PRACTICE, "PRACTICE_MANAGER", "indicadores")).toBe(`/conta/${PRACTICE}/indicadores`);
    expect(samePlaceIn(PRACTICE, "SECRETARY", "integracoes")).toBe(`/conta/${PRACTICE}`);
    expect(samePlaceIn(PRACTICE, "PRACTICE_MANAGER", "integracoes")).toBe(`/conta/${PRACTICE}/integracoes`);
    expect(samePlaceIn(PRACTICE, "SECRETARY", "unidades")).toBe(`/conta/${PRACTICE}`);
    expect(samePlaceIn(PRACTICE, "PRACTICE_MANAGER", "auditoria")).toBe(`/conta/${PRACTICE}/auditoria`);
  });

  it("keeps the settings hub and the phone's list when switching practice, for any role", () => {
    expect(samePlaceIn(PRACTICE, "SECRETARY", "configuracoes")).toBe(`/conta/${PRACTICE}/configuracoes`);
    expect(samePlaceIn(PRACTICE, "PROFESSIONAL", "mais")).toBe(`/conta/${PRACTICE}/mais`);
  });
});
