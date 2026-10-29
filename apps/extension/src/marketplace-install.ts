import type { CatalogueIndex, CatalogueRelease } from "@prism/schema/marketplace-catalogue";
import {
  catalogueIndexUrl,
  catalogueSignatureUrl,
  constantTimeEqualHex,
  findCatalogueRelease,
  packageUrl,
  parseCatalogueIndex,
  verifyCatalogueIndexSignatureWeb,
} from "@prism/schema/marketplace-catalogue";
import { extensionMeetsMinimum } from "@prism/schema/marketplace-bridge";
import {
  encodeArchiveForStorage,
  installedModFromPackedArchive,
} from "./packed-mod.js";

export type MarketplaceInstallPending = {
  readonly packageId: string;
  readonly version: string;
  readonly name: string;
  readonly author: string;
  readonly requiredCapabilities: readonly string[];
  readonly optionalCapabilities: readonly string[];
  readonly archive: string;
};

export type FetchLike = (
  input: string,
) => Promise<{ ok: boolean; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer> }>;

export async function sha256HexWeb(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function loadVerifiedCatalogueIndex(
  catalogueOrigin: string,
  fetchImpl: FetchLike,
): Promise<CatalogueIndex> {
  const indexResponse = await fetchImpl(catalogueIndexUrl(catalogueOrigin));
  const signatureResponse = await fetchImpl(catalogueSignatureUrl(catalogueOrigin));
  if (!indexResponse.ok || !signatureResponse.ok) {
    throw new Error("Catalogue index fetch failed");
  }
  const indexText = await indexResponse.text();
  const indexBytes = new TextEncoder().encode(indexText);
  const signature = await signatureResponse.text();
  if (!(await verifyCatalogueIndexSignatureWeb(indexBytes, signature))) {
    throw new Error("Catalogue index signature refused");
  }
  return parseCatalogueIndex(new TextDecoder().decode(indexBytes));
}

export async function downloadVerifiedMarketplacePackage(
  catalogueOrigin: string,
  release: CatalogueRelease,
  fetchImpl: FetchLike,
): Promise<Uint8Array> {
  const response = await fetchImpl(packageUrl(catalogueOrigin, release.packagePath));
  if (!response.ok) {
    throw new Error("Package download failed");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = await sha256HexWeb(bytes);
  if (!constantTimeEqualHex(digest, release.sha256)) {
    throw new Error("Package digest mismatch");
  }
  return bytes;
}

export function validateMarketplaceInstallRequest(
  release: CatalogueRelease,
  packageId: string,
  version: string,
  extensionVersion: string,
): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  if (release.packageId !== packageId || release.version !== version) {
    return { ok: false, error: "Catalogue entry mismatch" };
  }
  if (
    release.minExtensionVersion !== undefined &&
    !extensionMeetsMinimum(extensionVersion, release.minExtensionVersion)
  ) {
    return {
      ok: false,
      error: `Needs Prism v${release.minExtensionVersion}`,
    };
  }
  return { ok: true };
}

export async function prepareMarketplaceInstallPending(
  options: {
    readonly catalogueOrigin: string;
    readonly packageId: string;
    readonly version: string;
    readonly extensionVersion: string;
    readonly fetchImpl: FetchLike;
  },
): Promise<
  | { readonly ok: true; readonly pending: MarketplaceInstallPending }
  | { readonly ok: false; readonly error: string }
> {
  try {
    const index = await loadVerifiedCatalogueIndex(
      options.catalogueOrigin,
      options.fetchImpl,
    );
    const release = findCatalogueRelease(
      index,
      options.packageId,
      options.version,
    );
    if (release === undefined) {
      return { ok: false, error: "Mod is not in the signed catalogue" };
    }
    const requestCheck = validateMarketplaceInstallRequest(
      release,
      options.packageId,
      options.version,
      options.extensionVersion,
    );
    if (!requestCheck.ok) {
      return requestCheck;
    }
    const archive = await downloadVerifiedMarketplacePackage(
      options.catalogueOrigin,
      release,
      options.fetchImpl,
    );
    const imported = installedModFromPackedArchive(
      archive,
      `${release.slug}.prism`,
    );
    if (imported.manifest.id !== options.packageId) {
      return { ok: false, error: "Package id mismatch" };
    }
    if (imported.manifest.version !== options.version) {
      return { ok: false, error: "Package version mismatch" };
    }
    return {
      ok: true,
      pending: {
        packageId: release.packageId,
        version: release.version,
        name: release.name,
        author: release.author,
        requiredCapabilities: release.requiredCapabilities,
        optionalCapabilities: release.optionalCapabilities,
        archive: encodeArchiveForStorage(archive),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Install refused",
    };
  }
}

export function installedModSummaries(
  mods: ReadonlyArray<{
    readonly manifest: { readonly id: string; readonly version: string };
    readonly origin?: string;
  }>,
  enabled: Readonly<Record<string, boolean>>,
): Array<{ packageId: string; version: string; enabled: boolean }> {
  return mods
    .filter((mod) => mod.origin === "imported")
    .map((mod) => ({
      packageId: mod.manifest.id,
      version: mod.manifest.version,
      enabled: enabled[mod.manifest.id] ?? true,
    }));
}

export function meetsExtensionRequirement(
  installedVersion: string,
  minimumVersion: string | undefined,
): boolean {
  if (minimumVersion === undefined) {
    return true;
  }
  return extensionMeetsMinimum(installedVersion, minimumVersion);
}
