import { describe, expect, it } from "vitest";
import { countByFilter, dayLabel, groupByDay, parsePendingFilter, rowsFor, showsConfirmationWork, type PendingReason } from "./rules";

const TODAY = "2026-11-10";

function row(reason: PendingReason, date = TODAY) {
  return { reason, date };
}

describe("pending filters", () => {
  it("falls back to everything on an unknown filter", () => {
    expect(parsePendingFilter("sem-baixa")).toBe("sem-baixa");
    expect(parsePendingFilter("outra")).toBe("todas");
    expect(parsePendingFilter(undefined)).toBe("todas");
  });

  it("counts each reason under its filter and every row under Todas", () => {
    const rows = [row("unconfirmed"), row("reschedule_requested"), row("replied"), row("google_change"), row("google_conflict"), row("without_closing")];
    expect(countByFilter(rows)).toEqual({ todas: 6, "sem-confirmacao": 1, respostas: 2, google: 2, "sem-baixa": 1 });
  });

  it("keeps only the rows of the chosen filter", () => {
    const rows = [row("unconfirmed"), row("replied"), row("google_change")];
    expect(rowsFor(rows, "todas")).toHaveLength(3);
    expect(rowsFor(rows, "respostas").map((item) => item.reason)).toEqual(["replied"]);
  });
});

describe("the confirmation work timer (D-75)", () => {
  it("runs only while the screen shows unconfirmed appointments", () => {
    const rows = [row("unconfirmed"), row("google_change")];
    expect(showsConfirmationWork(rows, "todas")).toBe(true);
    expect(showsConfirmationWork(rows, "sem-confirmacao")).toBe(true);
    expect(showsConfirmationWork(rows, "google")).toBe(false);
    expect(showsConfirmationWork([row("google_change")], "todas")).toBe(false);
  });
});

describe("pending days", () => {
  it("names today, tomorrow and the other days", () => {
    expect(dayLabel(TODAY, TODAY)).toBe("Hoje, terça 10/11");
    expect(dayLabel("2026-11-11", TODAY)).toBe("Amanhã, quarta 11/11");
    expect(dayLabel("2026-11-12", TODAY)).toBe("Quinta 12/11");
  });

  it("lists the days in order and leaves the past ones in one group at the end", () => {
    const groups = groupByDay([row("google_change", "2026-11-12"), row("without_closing", "2026-11-09"), row("unconfirmed", TODAY), row("without_closing", "2026-11-05")], TODAY);
    expect(groups.map((group) => group.label)).toEqual(["Hoje, terça 10/11", "Quinta 12/11", "Dias anteriores"]);
    expect(groups[2].rows.map((item) => item.date)).toEqual(["2026-11-05", "2026-11-09"]);
  });
});
