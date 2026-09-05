import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function requiredPaths(targetRoot: string): string[] {
  return [
    join(targetRoot, "manifest.json"),
    join(targetRoot, "dist", "service-worker.js"),
    join(targetRoot, "dist", "content-script.js"),
    join(targetRoot, "bundled-mods.json"),
  ];
}

const chromeRoot = join(root, "apps", "extension", "targets", "chrome");
const firefoxRoot = join(root, "apps", "extension", "targets", "firefox");

const missing = [
  ...requiredPaths(chromeRoot),
  ...requiredPaths(firefoxRoot),
].filter((file) => !existsSync(file));

if (missing.length > 0) {
  console.error("Unpacked extension build is missing. Run `npm run build` first.");
  for (const file of missing) {
    console.error(`  missing ${file}`);
  }
  process.exit(1);
}
