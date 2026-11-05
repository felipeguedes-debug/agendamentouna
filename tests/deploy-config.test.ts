import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// What the first deploy depends on and no other test would notice changing (D-97).

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as { engines?: { node?: string }; scripts: Record<string, string> };
const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { regions?: string[]; buildCommand?: string; framework?: string };

describe("the deploy", () => {
  it("runs in São Paulo, next to the database (gru1 on Vercel's region list)", () => {
    expect(vercel.regions).toEqual(["gru1"]);
    expect(vercel.framework).toBe("nextjs");
  });

  it("builds first and migrates only after the build passed", () => {
    expect(vercel.buildCommand).toBe("npm run vercel:build");
    expect(packageJson.scripts["vercel:build"]).toBe("next build && npm run db:deploy");
  });

  it("migrates through the guard against the transaction pooler", () => {
    expect(packageJson.scripts["db:deploy"]).toBe("tsx scripts/db-deploy.ts");
  });

  it("pins Node to the major version the project runs on, which Vercel's default is not", () => {
    expect(packageJson.engines?.node).toBe("24.x");
    expect(readFileSync(".nvmrc", "utf8").trim()).toBe("24");
    expect(process.version.startsWith("v24.")).toBe(true);
  });

  it("refuses the commands that wipe or rewrite a database anywhere but this machine (D-98)", () => {
    expect(packageJson.scripts["db:reset"].startsWith("tsx scripts/assert-local-database.ts && ")).toBe(true);
    expect(packageJson.scripts["db:migrate"].startsWith("tsx scripts/assert-local-database.ts && ")).toBe(true);
  });
});
