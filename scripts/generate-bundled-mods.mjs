import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { strFromU8 } from "fflate";
import { isStyleSourcePath, loadPackedMod, packMod } from "../packages/schema/dist/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modsRoot = resolve(process.argv[2] ?? join(repoRoot, "mods"));
const chromeRoot = join(repoRoot, "apps", "extension", "targets", "chrome");
const firefoxRoot = join(repoRoot, "apps", "extension", "targets", "firefox");
const outputRoots = process.argv[3]
  ? [resolve(process.argv[3])]
  : [chromeRoot, firefoxRoot];

const packedItems = [];
const bundled = [];

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
  const styles = [];
  for (const [path, content] of Object.entries(loaded.files)) {
    if (isStyleSourcePath(path) && path.toLowerCase().endsWith(".css")) {
      styles.push(strFromU8(content));
    }
  }
  packedItems.push({ bundleDirectory, files: loaded.files });
  const entry = loaded.files["src/index.js"];
  bundled.push({
    manifest: loaded.manifest,
    entry:
      entry === undefined
        ? null
        : `bundled-mods/${bundleDirectory}/src/index.js`,
    ...(entry === undefined
      ? {}
      : { entrySource: strFromU8(entry) }),
    ...(styles.length === 0 ? {} : { styles }),
  });
}

function writePacked(outputRoot) {
  mkdirSync(outputRoot, { recursive: true });
  for (const item of packedItems) {
    for (const [path, content] of Object.entries(item.files)) {
      const destination = join(
        outputRoot,
        "bundled-mods",
        item.bundleDirectory,
        path,
      );
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, content);
    }
  }
  writeFileSync(
    join(outputRoot, "bundled-mods.json"),
    `${JSON.stringify(bundled, null, 2)}\n`,
  );
}

const sourceRoot = join(repoRoot, "apps", "extension", "src");
const schemaSrc = join(repoRoot, "packages", "schema", "src");
const schemaAlias = {
  "@prism/schema/archive": join(schemaSrc, "archive.ts"),
  "@prism/schema/css": join(schemaSrc, "css.ts"),
  "@prism/schema/inspect-package": join(schemaSrc, "inspect-package.ts"),
  "@prism/schema/usercss-map": join(schemaSrc, "usercss-map.ts"),
};

async function buildDist(outputRoot) {
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
    alias: schemaAlias,
  });
  await build({
    entryPoints: [join(sourceRoot, "content-script.ts")],
    bundle: true,
    entryNames: "[name]",
    format: "iife",
    outdir: browserOutput,
    platform: "browser",
    target: "chrome120",
    alias: schemaAlias,
  });
}

function copyChromePopup(outputRoot) {
  copyFileSync(join(chromeRoot, "popup.html"), join(outputRoot, "popup.html"));
  copyFileSync(join(chromeRoot, "popup.css"), join(outputRoot, "popup.css"));
}

const [firstRoot, ...otherRoots] = outputRoots;
writePacked(firstRoot);
await buildDist(firstRoot);
if (resolve(firstRoot) === firefoxRoot) {
  copyChromePopup(firstRoot);
}

for (const outputRoot of otherRoots) {
  writePacked(outputRoot);
  cpSync(join(firstRoot, "dist"), join(outputRoot, "dist"), {
    recursive: true,
  });
  if (resolve(outputRoot) === firefoxRoot) {
    copyChromePopup(outputRoot);
  }
}
