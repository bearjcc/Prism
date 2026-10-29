import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackedMod } from "../packages/schema/dist/pack.js";
import { validateManifest } from "../packages/schema/dist/validate.js";
import {
  catalogueSigningPrivateKeyForGenerate,
  catalogueSigningPublicKeyForVerify,
} from "./catalogue-signing-config.mjs";
import {
  signCatalogueIndexBytes,
  verifyCatalogueIndexBytes,
} from "./catalogue-signing-crypto.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const modsRoot = join(repoRoot, "mods");
const packagesRoot = join(repoRoot, "apps", "web", "public", "packages");
const webPublic = join(repoRoot, "apps", "web", "public");

const MARKETPLACE_SLUGS = new Set([
  "kitten-ad-replace",
  "youtube-home-videos",
  "youtube-reddit-comments",
  "linkedin-home-first-degree",
  "facebook-home-friends",
  "immich-upload",
  "word-replacer",
  "age-gate-auto-confirm",
  "subscribe-modal-dismiss",
]);

const privateKeyBase64 = catalogueSigningPrivateKeyForGenerate();
if (privateKeyBase64 === undefined) {
  console.error(
    "generate-catalogue-index: set PRISM_CATALOGUE_SIGNING_KEY or run under VITEST for tests.",
  );
  process.exit(1);
}

const publicKeyBase64 = catalogueSigningPublicKeyForVerify();

const releases = [];

for (const entry of readdirSync(modsRoot, { withFileTypes: true }).sort((a, b) =>
  a.name.localeCompare(b.name),
)) {
  if (!entry.isDirectory() || !MARKETPLACE_SLUGS.has(entry.name)) {
    continue;
  }
  const manifestPath = join(modsRoot, entry.name, "prism.yaml");
  if (!existsSync(manifestPath)) {
    continue;
  }
  const manifest = validateManifest(readFileSync(manifestPath, "utf8"), manifestPath);
  const packagePath = `/packages/${entry.name}.prism`;
  const filePath = join(packagesRoot, `${entry.name}.prism`);
  if (!existsSync(filePath)) {
    console.error(`generate-catalogue-index: missing ${filePath}`);
    process.exit(1);
  }
  const archive = new Uint8Array(readFileSync(filePath));
  const sha256 = createHash("sha256").update(archive).digest("hex");
  const loaded = loadPackedMod(archive, `${entry.name}.prism`);
  if (loaded.manifest.id !== manifest.id) {
    console.error(
      `generate-catalogue-index: archive manifest id ${loaded.manifest.id} != ${manifest.id}`,
    );
    process.exit(1);
  }
  releases.push({
    slug: entry.name,
    packageId: manifest.id,
    version: manifest.version,
    sha256,
    packagePath,
    name: entry.name,
    author: "Prism",
    requiredCapabilities: manifest.capabilities.required,
    optionalCapabilities: manifest.capabilities.optional ?? [],
  });
}

releases.sort((left, right) => left.slug.localeCompare(right.slug));

const index = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  releases,
};

const indexBytes = Buffer.from(`${JSON.stringify(index)}\n`, "utf8");
const signature = signCatalogueIndexBytes(indexBytes, privateKeyBase64);
const signatureBase64 = `${signature.toString("base64")}\n`;

if (!verifyCatalogueIndexBytes(indexBytes, signatureBase64, publicKeyBase64)) {
  console.error("generate-catalogue-index: signature self-check failed");
  process.exit(1);
}

writeFileSync(join(webPublic, "catalogue-index.json"), indexBytes);
writeFileSync(join(webPublic, "catalogue-index.sig"), signatureBase64, "utf8");

console.log(
  `generate-catalogue-index: wrote ${releases.length} releases to apps/web/public/catalogue-index.json`,
);
