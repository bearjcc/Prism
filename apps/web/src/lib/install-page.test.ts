import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const installPageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/install/page.tsx"),
  "utf8",
);

describe("install page", () => {
  it("renders all browser sections for no-JS users", () => {
    expect(installPageSource).toContain('data-browser="chromium"');
    expect(installPageSource).toContain('data-browser="firefox"');
    expect(installPageSource).toContain('data-browser="firefox-android"');
    expect(installPageSource).toContain("Load unpacked");
    expect(installPageSource).toContain("about:debugging");
  });

  it("does not treat CRX as the primary Chromium path", () => {
    expect(installPageSource).toContain("CRX_REQUIRED_PROOF_MISSING");
    expect(installPageSource).toMatch(/Secondary.*prism-chromium\.crx/s);
  });
});
