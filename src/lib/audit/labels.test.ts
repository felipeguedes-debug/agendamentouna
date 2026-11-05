import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AUDIT_ACTION_LABELS, AUDIT_AREA_PREFIXES, auditActionLabel, auditFieldsLabel } from "./labels";

// Every action the code writes has a label and an area, or the screen would say
// "Alteração registrada" and the filter would miss it (D-87).

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

const ACTION = /\b(?:action:\s*|audit\((?:[^"\n]*?,\s*)?)"([a-z_]+\.[a-z_]+)"/g;

function actionsInCode() {
  const found = new Set<string>();
  for (const file of [...sourceFiles("src/lib"), ...sourceFiles("src/app")]) {
    for (const match of readFileSync(file, "utf8").matchAll(ACTION)) found.add(match[1]);
  }
  return [...found];
}

describe("audit labels", () => {
  it("names every action written by the code", () => {
    const actions = actionsInCode();
    expect(actions.length).toBeGreaterThan(30);
    expect(actions.filter((action) => !AUDIT_ACTION_LABELS[action])).toEqual([]);
  });

  it("puts every label in an area of the filter", () => {
    const prefixes = Object.values(AUDIT_AREA_PREFIXES).flat();
    expect(Object.keys(AUDIT_ACTION_LABELS).filter((action) => !prefixes.some((prefix) => action.startsWith(prefix)))).toEqual([]);
  });

  it("has a text for an action it does not know", () => {
    expect(auditActionLabel("nova.acao")).toBe("Alteração registrada");
  });

  it("translates field names and joins the repeated ones", () => {
    expect(auditFieldsLabel(["startsAt", "endsAt", "reason"])).toBe("início, fim, motivo");
    expect(auditFieldsLabel(["startsOn", "startTime", "campoNovo"])).toBe("início, campoNovo");
  });
});
