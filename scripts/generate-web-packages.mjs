import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packMod } from "../packages/schema/dist/pack.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modsRoot = join(repoRoot, "mods");
const outputRoot = join(repoRoot, "apps", "web", "public", "packages");

const HOMEgrown = new Set([
  "kitten-ad-replace",
  "youtube-home-videos",
  "youtube-reddit-comments",
]);

mkdirSync(outputRoot, { recursive: true });

let written = 0;

for (const entry of readdirSync(modsRoot, { withFileTypes: true }).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (!entry.isDirectory() || !HOMEgrown.has(entry.name)) {
    continue;
  }
  const sourceRoot = join(modsRoot, entry.name);
  if (!existsSync(join(sourceRoot, "prism.yaml"))) {
    continue;
  }
  const packed = packMod(sourceRoot);
  const destination = join(outputRoot, `${entry.name}.prism`);
  writeFileSync(destination, packed.archive);
  written += 1;
}

if (written !== HOMEgrown.size) {
  console.error(
    `generate-web-packages: expected ${HOMEgrown.size} packages, wrote ${written}`,
  );
  process.exit(1);
}

console.log(`generate-web-packages: wrote ${written} .prism files to ${outputRoot}`);
