import { capabilityDiff, type PrismManifest } from "@prism/schema";
import { compareExtensionVersions } from "@prism/schema/marketplace-bridge";
import type { CatalogueRelease } from "@prism/schema/marketplace-catalogue";
import {
  findCatalogueReleaseForPackage,
  marketplaceCatalogueSigningConfigured,
  PRODUCTION_CATALOGUE_ORIGIN,
} from "@prism/schema/marketplace-catalogue";
import {
  downloadVerifiedMarketplacePackage,
  loadVerifiedCatalogueIndex,
  type FetchLike,
} from "./marketplace-install.js";
import {
  decodeArchiveFromStorage,
  encodeArchiveForStorage,
  installedModFromPackedArchive,
} from "./packed-mod.js";

export type MarketplaceUpdatePending = {
  readonly packageId: string;
  readonly fromVersion: string;
  readonly toVersion: string;
  readonly name: string;
  readonly author: string;
  readonly requiredCapabilities: readonly string[];
  readonly optionalCapabilities: readonly string[];
  readonly capabilityIncreases: readonly string[];
  readonly archive: string;
};

export type MarketplaceAutoUpdate = {
  readonly packageId: string;
  readonly archive: string;
  readonly release: CatalogueRelease;
};

export function catalogueVersionIsNewer(
  installedVersion: string,
  catalogueVersion: string,
): boolean {
  return compareExtensionVersions(catalogueVersion, installedVersion) > 0;
}

export function manifestFromStoredArchive(encoded: string): PrismManifest {
  return installedModFromPackedArchive(decodeArchiveFromStorage(encoded)).manifest;
}

export function capabilityIncreasesForUpdate(
  installedManifest: PrismManifest,
  nextManifest: PrismManifest,
): readonly string[] {
  return capabilityDiff(installedManifest, nextManifest).increases;
}

export async function checkMarketplaceUpdatesForImportedMods(options: {
  readonly catalogueOrigin?: string;
  readonly importedArchives: Readonly<Record<string, string>>;
  readonly fetchImpl: FetchLike;
  readonly extensionVersion: string;
}): Promise<
  | {
      readonly ok: true;
      readonly autoUpdates: readonly MarketplaceAutoUpdate[];
      readonly pendingReapproval: readonly MarketplaceUpdatePending[];
    }
  | { readonly ok: false; readonly error: string }
> {
  if (!marketplaceCatalogueSigningConfigured()) {
    return { ok: false, error: "Catalogue signing is not configured" };
  }
  const catalogueOrigin = options.catalogueOrigin ?? PRODUCTION_CATALOGUE_ORIGIN;
  try {
    const index = await loadVerifiedCatalogueIndex(catalogueOrigin, options.fetchImpl);
    const autoUpdates: MarketplaceAutoUpdate[] = [];
    const pendingReapproval: MarketplaceUpdatePending[] = [];

    for (const [packageId, encoded] of Object.entries(options.importedArchives)) {
      const installedManifest = manifestFromStoredArchive(encoded);
      const release = findCatalogueReleaseForPackage(index, packageId);
      if (release === undefined) {
        continue;
      }
      if (
        release.minExtensionVersion !== undefined &&
        compareExtensionVersions(options.extensionVersion, release.minExtensionVersion) < 0
      ) {
        continue;
      }
      if (!catalogueVersionIsNewer(installedManifest.version, release.version)) {
        continue;
      }
      const archive = await downloadVerifiedMarketplacePackage(
        catalogueOrigin,
        release,
        options.fetchImpl,
      );
      const nextManifest = installedModFromPackedArchive(
        archive,
        `${release.slug}.prism`,
      ).manifest;
      if (
        nextManifest.id !== release.packageId ||
        nextManifest.version !== release.version
      ) {
        continue;
      }
      const increases = capabilityIncreasesForUpdate(installedManifest, nextManifest);
      const archiveEncoded = encodeArchiveForStorage(archive);
      if (increases.length > 0) {
        pendingReapproval.push({
          packageId,
          fromVersion: installedManifest.version,
          toVersion: release.version,
          name: release.name,
          author: release.author,
          requiredCapabilities: release.requiredCapabilities,
          optionalCapabilities: release.optionalCapabilities,
          capabilityIncreases: increases,
          archive: archiveEncoded,
        });
        continue;
      }
      autoUpdates.push({ packageId, archive: archiveEncoded, release });
    }

    return { ok: true, autoUpdates, pendingReapproval };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Update check failed",
    };
  }
}

export function mergeAutoMarketplaceUpdates(
  importedArchives: Readonly<Record<string, string>>,
  autoUpdates: readonly MarketplaceAutoUpdate[],
): Record<string, string> {
  const next = { ...importedArchives };
  for (const update of autoUpdates) {
    next[update.packageId] = update.archive;
  }
  return next;
}

export function pickFirstUpdatePending(
  pending: readonly MarketplaceUpdatePending[],
): MarketplaceUpdatePending | undefined {
  return pending[0];
}
