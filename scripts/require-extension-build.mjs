import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const chromeRoot = join(root, "apps", "extension", "targets", "chrome");
const required = [
  join(chromeRoot, "manifest.json"),
  join(chromeRoot, "dist", "service-worker.js"),
  join(chromeRoot, "dist", "content-script.js"),
  join(chromeRoot, "bundled-mods.json"),
];

const missing = required.filter((file) => !existsSync(file));
if (missing.length > 0) {
  console.error("Unpacked Chromium build is missing. Run `npm run build` first.");
  for (const file of missing) {
    console.error(`  missing ${file}`);
  }
  process.exit(1);
}
