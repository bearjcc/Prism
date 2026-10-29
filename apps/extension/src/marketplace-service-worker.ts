import { MARKETPLACE_ENABLE_PENDING_STORAGE_KEY } from "@prism/schema/marketplace-bridge";
import { isCataloguePackageOrigin } from "@prism/schema/marketplace-bridge";
import {
  installedModSummaries,
  prepareMarketplaceInstallPending,
  type MarketplaceInstallPending,
} from "./marketplace-install.js";
import {
  decodeArchiveFromStorage,
  installedModFromPackedArchive,
  mergeInstalledMods,
} from "./packed-mod.js";
import type { BundledMod } from "./loader.js";

export type MarketplaceStorage = {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

export function catalogueOriginFromPageUrl(pageUrl: string | undefined): string | undefined {
  if (pageUrl === undefined) {
    return undefined;
  }
  try {
    const origin = new URL(pageUrl).origin;
    return isCataloguePackageOrigin(origin) ? origin : undefined;
  } catch {
    return undefined;
  }
}

export function isCatalogueContentScriptSender(pageUrl: string | undefined): boolean {
  return catalogueOriginFromPageUrl(pageUrl) !== undefined;
}

export async function readMarketplaceInstallPending(
  storage: MarketplaceStorage,
): Promise<MarketplaceInstallPending | undefined> {
  const stored = await storage.get(MARKETPLACE_ENABLE_PENDING_STORAGE_KEY);
  const pending = stored[MARKETPLACE_ENABLE_PENDING_STORAGE_KEY];
  if (typeof pending !== "object" || pending === null || Array.isArray(pending)) {
    return undefined;
  }
  const record = pending as Record<string, unknown>;
  if (
    typeof record.packageId !== "string" ||
    typeof record.version !== "string" ||
    typeof record.name !== "string" ||
    typeof record.author !== "string" ||
    typeof record.archive !== "string" ||
    !Array.isArray(record.requiredCapabilities) ||
    !Array.isArray(record.optionalCapabilities)
  ) {
    return undefined;
  }
  return {
    packageId: record.packageId,
    version: record.version,
    name: record.name,
    author: record.author,
    requiredCapabilities: record.requiredCapabilities.filter(
      (value): value is string => typeof value === "string",
    ),
    optionalCapabilities: record.optionalCapabilities.filter(
      (value): value is string => typeof value === "string",
    ),
    archive: record.archive,
  };
}

export async function clearMarketplaceInstallPending(
  storage: MarketplaceStorage,
): Promise<void> {
  await storage.remove(MARKETPLACE_ENABLE_PENDING_STORAGE_KEY);
}

export async function handleMarketplaceInstallRequest(options: {
  readonly catalogueOrigin: string;
  readonly packageId: string;
  readonly version: string;
  readonly extensionVersion: string;
  readonly fetchImpl: typeof fetch;
  readonly sessionStorage: MarketplaceStorage;
  readonly openOptionsPage: () => Promise<void>;
}): Promise<{ readonly ok: boolean; readonly error?: string }> {
  const prepared = await prepareMarketplaceInstallPending({
    catalogueOrigin: options.catalogueOrigin,
    packageId: options.packageId,
    version: options.version,
    extensionVersion: options.extensionVersion,
    fetchImpl: options.fetchImpl,
  });
  if (!prepared.ok) {
    return prepared;
  }
  await options.sessionStorage.set({
    [MARKETPLACE_ENABLE_PENDING_STORAGE_KEY]: prepared.pending,
  });
  await options.openOptionsPage();
  return { ok: true };
}

export async function confirmMarketplaceInstall(options: {
  readonly bundled: readonly BundledMod[];
  readonly importedArchives: Record<string, string>;
  readonly pending: MarketplaceInstallPending;
}): Promise<
  | { readonly ok: true; readonly importedArchives: Record<string, string> }
  | { readonly ok: false; readonly error: string }
> {
  try {
    const imported = installedModFromPackedArchive(
      decodeArchiveFromStorage(options.pending.archive),
      `${options.pending.packageId}.prism`,
    );
    if (imported.manifest.id !== options.pending.packageId) {
      return { ok: false, error: "Package id mismatch" };
    }
    mergeInstalledMods(options.bundled, [imported]);
    return {
      ok: true,
      importedArchives: {
        ...options.importedArchives,
        [imported.manifest.id]: options.pending.archive,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Package refused",
    };
  }
}

export function marketplaceBridgeState(
  extensionVersion: string,
  mods: ReadonlyArray<{
    readonly manifest: { readonly id: string; readonly version: string };
    readonly origin?: string;
  }>,
  enabled: Readonly<Record<string, boolean>>,
): {
  readonly extensionVersion: string;
  readonly installedMods: ReturnType<typeof installedModSummaries>;
} {
  return {
    extensionVersion,
    installedMods: installedModSummaries(mods, enabled),
  };
}
