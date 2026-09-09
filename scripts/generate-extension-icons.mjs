import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceSvg = join(repoRoot, "apps", "web", "src", "app", "icon.svg");
const iconRoot = join(
  repoRoot,
  "apps",
  "extension",
  "targets",
  "chrome",
  "icons",
);

const sizes = [16, 32, 48, 128];

mkdirSync(iconRoot, { recursive: true });

for (const size of sizes) {
  const png = await sharp(sourceSvg).resize(size, size).png().toBuffer();
  writeFileSync(join(iconRoot, `icon${size}.png`), png);
}
