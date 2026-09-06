import { existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = join(repoRoot, "apps", "web", "public", "packages");
const expected = [
  "kitten-ad-replace.prism",
  "youtube-home-videos.prism",
  "youtube-reddit-comments.prism",
];

describe("prepare-web-build", () => {
  it("writes marketplace .prism downloads for Railway and workspace builds", () => {
    for (const name of expected) {
      rmSync(join(packagesRoot, name), { force: true });
    }
    execFileSync(process.execPath, ["scripts/prepare-web-build.mjs"], {
      cwd: repoRoot,
    });
    for (const name of expected) {
      expect(existsSync(join(packagesRoot, name))).toBe(true);
    }
    const onDisk = readdirSync(packagesRoot).filter((name) => name.endsWith(".prism"));
    expect(onDisk.sort()).toEqual(expected.sort());
  });
});
