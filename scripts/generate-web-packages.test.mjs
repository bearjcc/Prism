import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = join(repoRoot, "apps", "web", "public", "packages");
const tscBin = join(
  repoRoot,
  "node_modules",
  "typescript",
  "bin",
  "tsc",
);

describe("generate-web-packages", () => {
  it("writes a .prism file for each homegrown tracer mod", () => {
<<<<<<< HEAD
    execFileSync(process.execPath, [tscBin, "-b"], { cwd: repoRoot });
    execFileSync(process.execPath, ["scripts/generate-web-packages.mjs"], {
      cwd: repoRoot,
    });
=======
    // CI runs `npm run build` before `npm test`, so @prism/schema dist already exists.
    execFileSync("node", ["scripts/generate-web-packages.mjs"], { cwd: repoRoot });
>>>>>>> b06ca96 (Fix Windows CI for marketplace tests.)
    const expected = [
      "kitten-ad-replace.prism",
      "youtube-home-videos.prism",
      "youtube-reddit-comments.prism",
    ];
    for (const name of expected) {
      expect(existsSync(join(packagesRoot, name))).toBe(true);
    }
    const onDisk = readdirSync(packagesRoot).filter((name) =>
      name.endsWith(".prism"),
    );
    expect(onDisk.sort()).toEqual(expected.sort());
  });
});
