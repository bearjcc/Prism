import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPack = join(repoRoot, "packages", "schema", "dist", "pack.js");
const tscBin = join(repoRoot, "node_modules", "typescript", "bin", "tsc");

if (!existsSync(schemaPack)) {
  execFileSync(process.execPath, [tscBin, "-b", "packages/schema"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

execFileSync(process.execPath, ["scripts/generate-web-packages.mjs"], {
  cwd: repoRoot,
  stdio: "inherit",
});
