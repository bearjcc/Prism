import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { catalogue } from "./catalogue";

const webSrc = dirname(fileURLToPath(import.meta.url));
const about = readFileSync(join(webSrc, "../app/about/page.tsx"), "utf8");
const catalogueSource = readFileSync(join(webSrc, "catalogue.ts"), "utf8");
const statsSource = readFileSync(join(webSrc, "listing-stats.ts"), "utf8");

describe("listing trust copy", () => {
  it("never treats payment, donation, or verified as extra safety", () => {
    const blob = JSON.stringify(catalogue());
    expect(blob).not.toMatch(/verified|donat|subscriber|paid\s*safe/i);
    expect(about).toMatch(/not extra safety/);
    expect(about).toMatch(/optional badge with no product power/);
  });

  it("does not bake install or rating numbers into listing copy", () => {
    expect(catalogueSource).not.toMatch(/listing-stats\.fixture/);
    expect(catalogueSource).not.toMatch(/\binstalls\s*:/);
    expect(catalogueSource).not.toMatch(/\bratingCount\s*:/);
    expect(statsSource).not.toMatch(/\binstalls:\s*[1-9]/);
    for (const mod of catalogue()) {
      expect(mod.installs).toBe(0);
      expect(mod.rating).toBeNull();
      expect(mod.ratingCount).toBe(0);
      expect(mod.author).toBe("Prism");
    }
  });
});
