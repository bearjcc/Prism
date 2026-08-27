import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { loadPackedMod, packMod } from "../packages/schema/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modsRoot = resolve(process.argv[2] ?? join(repoRoot, "mods"));
const outputRoot = resolve(
  process.argv[3] ?? join(repoRoot, "apps", "extension", "targets", "chrome"),
);

const bundled = [];
mkdirSync(outputRoot, { recursive: true });

for (const directory of readdirSync(modsRoot, { withFileTypes: true }).sort(
  (left, right) => left.name.localeCompare(right.name),
)) {
  if (!directory.isDirectory()) {
    continue;
  }
  const sourceRoot = join(modsRoot, directory.name);
  if (!existsSync(join(sourceRoot, "prism.yaml"))) {
    continue;
  }

  const packed = packMod(sourceRoot);
  const loaded = loadPackedMod(packed.archive, `${directory.name}.prism`);
  const bundleDirectory = encodeURIComponent(loaded.manifest.id);
  for (const [path, content] of Object.entries(loaded.files)) {
    const destination = join(outputRoot, "bundled-mods", bundleDirectory, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content);
  }
  const entry = loaded.files["src/index.js"];
  bundled.push({
    manifest: loaded.manifest,
    entry:
      entry === undefined
        ? null
        : `bundled-mods/${bundleDirectory}/src/index.js`,
  });
}

const sourceRoot = join(repoRoot, "apps", "extension", "src");
const browserOutput = join(outputRoot, "dist");
await build({
  entryPoints: [
    join(sourceRoot, "service-worker.ts"),
    join(sourceRoot, "popup.ts"),
  ],
  bundle: true,
  entryNames: "[name]",
  format: "esm",
  outdir: browserOutput,
  platform: "browser",
  target: "chrome120",
});
await build({
  entryPoints: [join(sourceRoot, "content-script.ts")],
  bundle: true,
  entryNames: "[name]",
  format: "iife",
  outdir: browserOutput,
  platform: "browser",
  target: "chrome120",
});

writeFileSync(
  join(outputRoot, "bundled-mods.json"),
  `${JSON.stringify(bundled, null, 2)}\n`,
);
