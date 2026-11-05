import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CROSS_PRACTICE_MODELS,
  PRACTICE_SCOPED_MODELS,
  USER_RELATION_FIELDS,
} from "./practice-scope";

// Keeps new models from slipping past practice isolation (D-02, D-30).

type Field = { name: string; type: string; attributes: string };
type Model = { name: string; fields: Field[]; blockAttributes: string[] };

function parseSchema(): Map<string, Model> {
  const source = readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const models = new Map<string, Model>();
  for (const match of source.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    const model: Model = { name: match[1], fields: [], blockAttributes: [] };
    for (const rawLine of match[2].split("\n")) {
      const line = rawLine.replace(/\/\/.*$/, "").trim();
      if (!line) continue;
      if (line.startsWith("@@")) {
        model.blockAttributes.push(line.replace(/\s+/g, ""));
        continue;
      }
      const field = line.match(/^(\w+)\s+(\w+)(\[\])?\??\s*(.*)$/);
      if (field) model.fields.push({ name: field[1], type: field[2], attributes: field[4] });
    }
    models.set(model.name, model);
  }
  return models;
}

const models = parseSchema();
const scoped = new Set<string>(PRACTICE_SCOPED_MODELS);

describe("schema guard for practice isolation", () => {
  it("lists exactly the models that have practiceId as practice-scoped", () => {
    const withPracticeId = [...models.values()]
      .filter((model) => model.fields.some((field) => field.name === "practiceId"))
      .map((model) => model.name)
      .sort();
    expect(withPracticeId).toEqual([...PRACTICE_SCOPED_MODELS].sort());
  });

  it("classifies every model", () => {
    const classified = new Set<string>([...PRACTICE_SCOPED_MODELS, ...CROSS_PRACTICE_MODELS, "Practice", "User"]);
    const unclassified = [...models.keys()].filter((name) => !classified.has(name));
    expect(unclassified).toEqual([]);
  });

  it("gives every practice-scoped model a unique (id, practiceId) for composite foreign keys", () => {
    const missing = PRACTICE_SCOPED_MODELS.filter(
      (name) => !models.get(name)?.blockAttributes.includes("@@unique([id,practiceId])"),
    );
    expect(missing).toEqual([]);
  });

  it("links practice-scoped models to each other only through composite foreign keys", () => {
    const singleColumn: string[] = [];
    for (const name of PRACTICE_SCOPED_MODELS) {
      for (const field of models.get(name)!.fields) {
        const fields = field.attributes.match(/@relation\([^)]*fields:\s*\[([^\]]*)\]/);
        if (!fields || !scoped.has(field.type)) continue;
        const columns = fields[1].split(",").map((column) => column.trim());
        if (!columns.includes("practiceId")) singleColumn.push(`${name}.${field.name}`);
      }
    }
    expect(singleColumn).toEqual([]);
  });

  it("knows every User relation the scoped client must hide", () => {
    const relations = models
      .get("User")!
      .fields.filter((field) => models.has(field.type))
      .map((field) => field.name)
      .sort();
    expect(relations).toEqual([...USER_RELATION_FIELDS].sort());
  });
});
