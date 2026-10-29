import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { derivePublicKeyBase64FromPrivateSeed } from "./catalogue-signing-crypto.mjs";
import {
  MARKETPLACE_CATALOGUE_TEST_PRIVATE_KEY_BASE64,
  MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64,
} from "./marketplace-catalogue-test-keys.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Former in-repo fixture key (private was committed). Never trust again. */
export const REVOKED_CATALOGUE_PUBLIC_KEYS_BASE64 = [
  "NA6FNpXz+eP/5SRPqxKuVaFGUGV5r9NXMEPm2tXinLY=",
];

export function readCommittedCataloguePublicKeyBase64() {
  const sourcePath = join(
    repoRoot,
    "packages",
    "schema",
    "src",
    "catalogue-signing-public-key.ts",
  );
  const source = readFileSync(sourcePath, "utf8");
  const match = source.match(
    /MARKETPLACE_CATALOGUE_SIGNING_PUBLIC_KEY_BASE64\s*=\s*"([^"]*)"/u,
  );
  if (match === null) {
    throw new Error("Could not read catalogue signing public key from schema source");
  }
  return match[1].trim();
}

export function isForbiddenProductionCataloguePublicKey(publicKeyBase64) {
  const key = publicKeyBase64.trim();
  if (key.length === 0) {
    return true;
  }
  if (REVOKED_CATALOGUE_PUBLIC_KEYS_BASE64.includes(key)) {
    return true;
  }
  if (key === MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64) {
    return true;
  }
  return false;
}

export function resolveCatalogueSigningPrivateKeyBase64() {
  const fromEnv = process.env.PRISM_CATALOGUE_SIGNING_KEY?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return undefined;
}

export function assertProductionCatalogueSigningReady() {
  const publicKey = readCommittedCataloguePublicKeyBase64();
  if (isForbiddenProductionCataloguePublicKey(publicKey)) {
    console.error(
      "catalogue-signing: production public key is missing or uses a revoked/test-only key.",
    );
    console.error(
      "Run `node scripts/generate-catalogue-signing-keypair.mjs` locally, commit the public key,",
    );
    console.error(
      "and set PRISM_CATALOGUE_SIGNING_KEY in GitHub Actions + Railway (never commit the private key).",
    );
    process.exit(1);
  }
  const privateKey = resolveCatalogueSigningPrivateKeyBase64();
  if (privateKey === undefined) {
    console.error(
      "catalogue-signing: PRISM_CATALOGUE_SIGNING_KEY is not set; refusing to sign catalogue-index.",
    );
    process.exit(1);
  }
  const derivedPublic = derivePublicKeyBase64FromPrivateSeed(privateKey);
  if (derivedPublic !== publicKey) {
    console.error(
      "catalogue-signing: PRISM_CATALOGUE_SIGNING_KEY does not match the committed public key.",
    );
    process.exit(1);
  }
}

export function assertCatalogueSigningForBuild() {
  if (process.env.VITEST === "true") {
    return;
  }
  assertProductionCatalogueSigningReady();
}

export function catalogueSigningPrivateKeyForGenerate() {
  const privateKey = resolveCatalogueSigningPrivateKeyBase64();
  if (privateKey !== undefined) {
    return privateKey;
  }
  if (process.env.VITEST === "true") {
    return MARKETPLACE_CATALOGUE_TEST_PRIVATE_KEY_BASE64;
  }
  return undefined;
}

export function catalogueSigningPublicKeyForVerify() {
  const committed = readCommittedCataloguePublicKeyBase64();
  if (!isForbiddenProductionCataloguePublicKey(committed)) {
    return committed;
  }
  if (process.env.VITEST === "true") {
    return MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64;
  }
  return committed;
}

export {
  MARKETPLACE_CATALOGUE_TEST_PRIVATE_KEY_BASE64,
  MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64,
};
