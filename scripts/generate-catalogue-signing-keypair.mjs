#!/usr/bin/env node
/**
 * Generate a production catalogue Ed25519 keypair for Bear to run locally only.
 *
 * - Writes the public key into packages/schema/src/catalogue-signing-public-key.ts
 * - Writes the private seed to ./catalogue-signing-private-key.local.base64 (gitignored)
 * - Does not print the private key to stdout
 *
 * After running:
 * 1. Commit the updated catalogue-signing-public-key.ts
 * 2. Add the private file contents as PRISM_CATALOGUE_SIGNING_KEY in:
 *    - GitHub repo Settings -> Secrets -> Actions
 *    - Railway @prism/web service variables
 */
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateEd25519KeypairSeedsBase64 } from "./catalogue-signing-crypto.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicKeySource = join(
  repoRoot,
  "packages",
  "schema",
  "src",
  "catalogue-signing-public-key.ts",
);
const localPrivatePath = join(repoRoot, "catalogue-signing-private-key.local.base64");

const { privateKeyBase64, publicKeyBase64 } = generateEd25519KeypairSeedsBase64();

writeFileSync(
  publicKeySource,
  `/**
 * Production Ed25519 public key (32 bytes, base64) for webprism.app catalogue-index.sig.
 *
 * Set by running \`node scripts/generate-catalogue-signing-keypair.mjs\` locally, then commit
 * this file. Until configured, marketplace signing and installs fail closed.
 */
export const MARKETPLACE_CATALOGUE_SIGNING_PUBLIC_KEY_BASE64 = "${publicKeyBase64}";

`,
  "utf8",
);

writeFileSync(localPrivatePath, `${privateKeyBase64}\n`, { mode: 0o600 });

console.log("Updated production catalogue signing public key in:");
console.log(`  ${publicKeySource}`);
console.log("");
console.log("Private seed written to (gitignored, do not commit):");
console.log(`  ${localPrivatePath}`);
console.log("");
console.log("Next steps for Bear:");
console.log("  1. Commit catalogue-signing-public-key.ts");
console.log(
  "  2. Paste the single line from catalogue-signing-private-key.local.base64 into secret PRISM_CATALOGUE_SIGNING_KEY",
);
console.log("     - GitHub: Settings -> Secrets and variables -> Actions");
console.log("     - Railway: @prism/web service -> Variables");
