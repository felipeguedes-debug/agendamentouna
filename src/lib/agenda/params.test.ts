import { describe, expect, it } from "vitest";
import { agendaHref, isFutureSlot, isPhoneUserAgent, parseAgendaPanel, parseAgendaParams, withPanel, type AgendaQuery } from "./params";

const TODAY = "2026-11-10";
const PRACTICE = "11111111-1111-1111-1111-111111111111";
const ID = "22222222-2222-2222-2222-222222222222";
const week: AgendaQuery = { view: "semana", date: TODAY, professionalId: null, category: null, status: null };

describe("agenda URL (D-41)", () => {
  it("opens on the week by default, or on the day's list on a phone (D-82)", () => {
    expect(parseAgendaParams({}, TODAY).view).toBe("semana");
    expect(parseAgendaParams({}, TODAY, "lista").view).toBe("lista");
    expect(parseAgendaParams({ visao: "mes" }, TODAY, "lista").view).toBe("mes");
  });

  it("leaves out only the view that is already the default", () => {
    expect(agendaHref(PRACTICE, week, TODAY)).toBe(`/conta/${PRACTICE}`);
    expect(agendaHref(PRACTICE, week, TODAY, "lista")).toBe(`/conta/${PRACTICE}?visao=semana`);
    expect(agendaHref(PRACTICE, { ...week, view: "lista" }, TODAY, "lista")).toBe(`/conta/${PRACTICE}`);
  });
});

describe("agenda panels (D-83, D-85)", () => {
  it("reads the appointment and its tab", () => {
    expect(parseAgendaPanel({ agendamento: ID })).toEqual({ kind: "appointment", id: ID, tab: "resumo" });
    expect(parseAgendaPanel({ agendamento: ID, aba: "mensagens" })).toEqual({ kind: "appointment", id: ID, tab: "mensagens" });
    expect(parseAgendaPanel({ agendamento: ID, aba: "outra" })).toEqual({ kind: "appointment", id: ID, tab: "resumo" });
  });

  it("reads a new block with what the free slot knew, and an existing one", () => {
    expect(parseAgendaPanel({ bloqueio: "novo", bloqueioData: "2026-11-11", bloqueioHora: "11:00", bloqueioProfissional: ID })).toEqual({
      kind: "new-block",
      date: "2026-11-11",
      time: "11:00",
      professionalId: ID,
    });
    expect(parseAgendaPanel({ bloqueio: "novo", bloqueioData: "ontem" })).toEqual({ kind: "new-block", date: null, time: null, professionalId: null });
    expect(parseAgendaPanel({ bloqueio: ID })).toEqual({ kind: "block", id: ID });
    expect(parseAgendaPanel({})).toBeNull();
  });

  it("adds the panel to any agenda link", () => {
    expect(withPanel(`/conta/${PRACTICE}`, { kind: "appointment", id: ID, tab: "resumo" })).toBe(`/conta/${PRACTICE}?agendamento=${ID}`);
    expect(withPanel(`/conta/${PRACTICE}?visao=dia`, { kind: "appointment", id: ID, tab: "historico" })).toBe(`/conta/${PRACTICE}?visao=dia&agendamento=${ID}&aba=historico`);
    expect(withPanel(`/conta/${PRACTICE}`, { kind: "new-block", date: "2026-11-11", time: "11:00", professionalId: null })).toBe(`/conta/${PRACTICE}?bloqueio=novo&bloqueioData=2026-11-11&bloqueioHora=11%3A00`);
    expect(withPanel(`/conta/${PRACTICE}`, { kind: "block", id: ID })).toBe(`/conta/${PRACTICE}?bloqueio=${ID}`);
  });
});

describe("free slots (D-82)", () => {
  it("are offered from the current hour on", () => {
    const now = { date: TODAY, hour: 9 };
    expect(isFutureSlot({ date: TODAY, hour: 9 }, now)).toBe(true);
    expect(isFutureSlot({ date: TODAY, hour: 8 }, now)).toBe(false);
    expect(isFutureSlot({ date: "2026-11-09", hour: 18 }, now)).toBe(false);
    expect(isFutureSlot({ date: "2026-11-11", hour: 7 }, now)).toBe(true);
  });
});

describe("phone requests", () => {
  it("recognizes a phone by its user agent", () => {
    expect(isPhoneUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe(true);
    expect(isPhoneUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1")).toBe(true);
    expect(isPhoneUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36")).toBe(false);
    expect(isPhoneUserAgent(null)).toBe(false);
  });
});
