import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

// What a browser needs to offer the installation (D-76). Installing on a real phone
// is a manual test, recorded in docs/decisoes.md (D-79).

const pngSize = (file: string) => {
  const png = readFileSync(file);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  return `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
};

describe("manifest", () => {
  const app = manifest();

  it("opens as an app on the day's agenda", () => {
    expect(app).toMatchObject({ display: "standalone", start_url: "/pwa", scope: "/", lang: "pt-BR" });
    expect(app.name).toBeTruthy();
    expect(app.short_name).toBeTruthy();
  });

  it("has the icons browsers ask for, each with the size it declares", () => {
    const icons = app.icons ?? [];
    expect(icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of icons) expect(pngSize(path.join(process.cwd(), "public", icon.src))).toBe(icon.sizes);
  });

  it("has the icon iOS uses for the home screen and the badge of the notification", () => {
    expect(pngSize(path.join(process.cwd(), "src", "app", "apple-icon.png"))).toBe("180x180");
    expect(pngSize(path.join(process.cwd(), "public", "icons", "badge-72.png"))).toBe("72x72");
  });
});
