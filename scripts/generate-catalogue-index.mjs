import { createHash, createPrivateKey, sign } from "node:crypto";
import { Buffer } from "node:buffer";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPackedMod } from "../packages/schema/dist/pack.js";
import { validateManifest } from "../packages/schema/dist/validate.js";
import { MARKETPLACE_FIXTURE_PRIVATE_KEY_BASE64 } from "./marketplace-fixture-signing.mjs";

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

const privateKeyBytes = Buffer.from(
  MARKETPLACE_FIXTURE_PRIVATE_KEY_BASE64,
  "base64",
);
const privateKey = createPrivateKey({
  key: Buffer.concat([
    Buffer.from("302e020100300506032b657004220420", "hex"),
    privateKeyBytes,
  ]),
  format: "der",
  type: "pkcs8",
});

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
const signature = sign(null, indexBytes, privateKey);

writeFileSync(join(webPublic, "catalogue-index.json"), indexBytes);
writeFileSync(
  join(webPublic, "catalogue-index.sig"),
  `${signature.toString("base64")}\n`,
  "utf8",
);

console.log(
  `generate-catalogue-index: wrote ${releases.length} releases to apps/web/public/catalogue-index.json`,
);
