import { isCapabilityId } from "./capabilities.js";

export const MARKETPLACE_CATALOGUE_SCHEMA_VERSION = 1 as const;

/** Pinned Ed25519 public key for the first-party webprism.app fixture index. */
export const MARKETPLACE_CATALOGUE_PUBLIC_KEY_BASE64 =
  "NA6FNpXz+eP/5SRPqxKuVaFGUGV5r9NXMEPm2tXinLY=";

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
  publicKeyBase64: string = MARKETPLACE_CATALOGUE_PUBLIC_KEY_BASE64,
): Promise<boolean> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    return false;
  }
  const publicKey = await subtle.importKey(
    "raw",
    Uint8Array.from(atob(publicKeyBase64), (char) => char.charCodeAt(0)),
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
