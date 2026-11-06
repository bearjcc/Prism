import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertCatalogueSigningForBuild,
  isProductionCatalogueSigningConfigured,
} from "./catalogue-signing-config.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPack = join(repoRoot, "packages", "schema", "dist", "pack.js");
const tscBin = join(repoRoot, "node_modules", "typescript", "bin", "tsc");

if (!existsSync(schemaPack)) {
  execFileSync(process.execPath, [tscBin, "-b", "packages/schema"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
}

assertCatalogueSigningForBuild();

execFileSync(process.execPath, ["scripts/generate-web-packages.mjs"], {
  cwd: repoRoot,
  stdio: "inherit",
});

const shouldRefreshSignedCatalogueIndex =
  isProductionCatalogueSigningConfigured() || process.env.VITEST === "true";

if (shouldRefreshSignedCatalogueIndex) {
  execFileSync(process.execPath, ["scripts/generate-catalogue-index.mjs"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
} else {
  console.warn(
    "catalogue-signing: skipping signed catalogue-index refresh (production signing not configured).",
  );
  console.warn(
    "catalogue-signing: extension marketplace installs stay disabled until a production public key and PRISM_CATALOGUE_SIGNING_KEY are configured.",
  );
}
