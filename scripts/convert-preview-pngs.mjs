import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(repoRoot, "prism-design-audit", "previews");
const outDir = join(repoRoot, "apps", "web", "public", "previews");

const sources = [
  "kitten-ad-replace",
  "youtube-home-videos",
  "youtube-reddit-comments",
];

for (const name of sources) {
  const pngPath = join(srcDir, `${name}.png`);
  const png = readFileSync(pngPath);
  const webp = await sharp(png)
    .resize(640, 400, { fit: "cover", position: "top" })
    .webp({ quality: 82 })
    .toBuffer();
  const out = join(outDir, `${name}.webp`);
  writeFileSync(out, webp);
  console.log(`${name}: ${png.length} bytes png -> ${webp.length} bytes webp -> ${out}`);
}
