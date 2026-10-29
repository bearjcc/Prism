import { isCapabilityId } from "./capabilities.js";
import { MARKETPLACE_CATALOGUE_SIGNING_PUBLIC_KEY_BASE64 } from "./catalogue-signing-public-key.js";
import { MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64 } from "./catalogue-signing-test-keys.js";

export const MARKETPLACE_CATALOGUE_SCHEMA_VERSION = 1 as const;

/** Former in-repo fixture key (private was committed). Never trust again. */
export const REVOKED_CATALOGUE_PUBLIC_KEYS_BASE64 = [
  "NA6FNpXz+eP/5SRPqxKuVaFGUGV5r9NXMEPm2tXinLY=",
] as const;

export const PRODUCTION_CATALOGUE_ORIGIN = "https://webprism.app";
export const DEV_CATALOGUE_ORIGIN = "http://localhost:3000";

export type CatalogueRelease = {
  readonly slug: string;
  readonly packageId: string;
  readonly version: string;
  readonly sha256: string;
  readonly packagePath: string;
  readonly name: string;
  readonly author: string;
  readonly requiredCapabilities: readonly string[];
  readonly optionalCapabilities: readonly string[];
  readonly minExtensionVersion?: string;
};

export type CatalogueIndex = {
  readonly schemaVersion: typeof MARKETPLACE_CATALOGUE_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly releases: readonly CatalogueRelease[];
};

export function isForbiddenProductionCataloguePublicKey(publicKeyBase64: string): boolean {
  const key = publicKeyBase64.trim();
  if (key.length === 0) {
    return true;
  }
  if ((REVOKED_CATALOGUE_PUBLIC_KEYS_BASE64 as readonly string[]).includes(key)) {
    return true;
  }
  if (key === MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64) {
    return true;
  }
  return false;
}

/** Production public key pinned in extension builds; null until configured. */
export function resolveMarketplaceCataloguePublicKeyBase64(): string | null {
  if (process.env.VITEST === "true") {
    return MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64;
  }
  const committed = MARKETPLACE_CATALOGUE_SIGNING_PUBLIC_KEY_BASE64.trim();
  if (isForbiddenProductionCataloguePublicKey(committed)) {
    return null;
  }
  return committed;
}

export function marketplaceCatalogueSigningConfigured(): boolean {
  return resolveMarketplaceCataloguePublicKeyBase64() !== null;
}

/** @deprecated Use resolveMarketplaceCataloguePublicKeyBase64(); empty when signing is not configured. */
export function marketplaceCataloguePublicKeyBase64ForLegacyExports(): string {
  return resolveMarketplaceCataloguePublicKeyBase64() ?? "";
}

export function catalogueOriginsForPackages(): readonly string[] {
  return [PRODUCTION_CATALOGUE_ORIGIN, DEV_CATALOGUE_ORIGIN];
}

export function isCataloguePackageOrigin(origin: string): boolean {
  return catalogueOriginsForPackages().includes(origin);
}

export function catalogueIndexUrl(origin: string): string {
  return new URL("/catalogue-index.json", origin).href;
}

export function catalogueSignatureUrl(origin: string): string {
  return new URL("/catalogue-index.sig", origin).href;
}

export function packageUrl(origin: string, packagePath: string): string {
  return new URL(packagePath, origin).href;
}

export async function verifyCatalogueIndexSignatureWeb(
  indexBytes: Uint8Array,
  signatureBase64: string,
  publicKeyBase64?: string,
): Promise<boolean> {
  const pinned = publicKeyBase64 ?? resolveMarketplaceCataloguePublicKeyBase64();
  if (pinned === null) {
    return false;
  }
  if (
    process.env.VITEST !== "true" &&
    isForbiddenProductionCataloguePublicKey(pinned)
  ) {
    return false;
  }
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    return false;
  }
  const publicKey = await subtle.importKey(
    "raw",
    Uint8Array.from(atob(pinned), (char) => char.charCodeAt(0)),
    { name: "Ed25519" },
    false,
    ["verify"],
  );
  return subtle.verify(
    "Ed25519",
    publicKey,
    Uint8Array.from(atob(signatureBase64.trim()), (char) => char.charCodeAt(0)),
    new Uint8Array(indexBytes),
  );
}

function readStringField(
  record: Record<string, unknown>,
  field: string,
): string {
  const value = record[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`Catalogue release missing ${field}`);
  }
  return value;
}

function readCapabilityList(
  record: Record<string, unknown>,
  field: "requiredCapabilities" | "optionalCapabilities",
): string[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`Catalogue release missing ${field}`);
  }
  const capabilities: string[] = [];
  for (const capability of value) {
    if (typeof capability !== "string" || !isCapabilityId(capability)) {
      throw new Error(`Unknown capability in ${field}`);
    }
    capabilities.push(capability);
  }
  return capabilities;
}

export function parseCatalogueIndex(jsonText: string): CatalogueIndex {
  const parsed: unknown = JSON.parse(jsonText);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Catalogue index must be an object");
  }
  const record = parsed as Record<string, unknown>;
  if (record.schemaVersion !== MARKETPLACE_CATALOGUE_SCHEMA_VERSION) {
    throw new Error("Unsupported catalogue index schema");
  }
  if (typeof record.generatedAt !== "string") {
    throw new Error("Catalogue index missing generatedAt");
  }
  if (!Array.isArray(record.releases)) {
    throw new Error("Catalogue index missing releases");
  }
  const releases: CatalogueRelease[] = [];
  for (const entry of record.releases) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error("Invalid catalogue release entry");
    }
    const release = entry as Record<string, unknown>;
    const sha256 = readStringField(release, "sha256");
    if (!/^[a-f0-9]{64}$/u.test(sha256)) {
      throw new Error("Catalogue release sha256 must be lowercase hex");
    }
    releases.push({
      slug: readStringField(release, "slug"),
      packageId: readStringField(release, "packageId"),
      version: readStringField(release, "version"),
      sha256,
      packagePath: readStringField(release, "packagePath"),
      name: readStringField(release, "name"),
      author: readStringField(release, "author"),
      requiredCapabilities: readCapabilityList(release, "requiredCapabilities"),
      optionalCapabilities: readCapabilityList(release, "optionalCapabilities"),
      ...(typeof release.minExtensionVersion === "string"
        ? { minExtensionVersion: release.minExtensionVersion }
        : {}),
    });
  }
  return {
    schemaVersion: MARKETPLACE_CATALOGUE_SCHEMA_VERSION,
    generatedAt: record.generatedAt,
    releases,
  };
}

export function findCatalogueRelease(
  index: CatalogueIndex,
  packageId: string,
  version: string,
): CatalogueRelease | undefined {
  return index.releases.find(
    (release) => release.packageId === packageId && release.version === version,
  );
}

export function findCatalogueReleaseForPackage(
  index: CatalogueIndex,
  packageId: string,
): CatalogueRelease | undefined {
  return index.releases.find((release) => release.packageId === packageId);
}

export function constantTimeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}
