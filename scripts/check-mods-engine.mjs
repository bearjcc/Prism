import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function listModManifestPaths(modsRoot) {
  if (!existsSync(modsRoot) || !statSync(modsRoot).isDirectory()) {
    return [];
  }

  const paths = [];
  for (const entry of readdirSync(modsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = join(modsRoot, entry.name, "prism.yaml");
    if (existsSync(manifestPath) && statSync(manifestPath).isFile()) {
      paths.push(manifestPath);
    }
  }
  return paths.sort((left, right) => left.localeCompare(right));
}

export function checkModsEngine(modsRoot, validateManifest, packMod) {
  const paths = listModManifestPaths(modsRoot);
  const messages = [];
  const manifests = [];

  if (paths.length === 0) {
    messages.push(
      `no mods/*/prism.yaml under ${modsRoot}; engine directory is empty`,
    );
    return { ok: false, messages, manifests };
  }

  for (const manifestPath of paths) {
    const source = readFileSync(manifestPath, "utf8");
    if (source.trim().length === 0) {
      messages.push(`${manifestPath}: manifest is empty`);
      continue;
    }
    try {
      const manifest = validateManifest(source, manifestPath);
      if (packMod !== undefined) {
        packMod(dirname(manifestPath));
      }
      manifests.push(manifest);
    } catch (error) {
      messages.push(error instanceof Error ? error.message : String(error));
    }
  }

  return { ok: messages.length === 0, messages, manifests };
}

const thisFile = fileURLToPath(import.meta.url);
const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).toLowerCase() === thisFile.toLowerCase();

if (isMain) {
  const root = join(dirname(thisFile), "..");
  const modsRoot = resolve(process.argv[2] ?? join(root, "mods"));
  let validateManifest;
  try {
    ({ validateManifest } = await import("../packages/schema/dist/validate.js"));
  } catch (error) {
    console.error(
      "check-mods-engine: cannot load @prism/schema validate; run npm run build first",
    );
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  let packMod;
  try {
    ({ packMod } = await import("../packages/schema/dist/pack.js"));
  } catch (error) {
    console.error(
      "check-mods-engine: cannot load @prism/schema pack; run npm run build first",
    );
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
  const result = checkModsEngine(modsRoot, validateManifest, packMod);
  if (!result.ok) {
    for (const message of result.messages) {
      console.error(message);
    }
    process.exit(1);
  }
}
