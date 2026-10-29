import {
  MARKETPLACE_UPDATE_CHECK_INTERVAL_MS,
  MARKETPLACE_UPDATE_LAST_CHECK_STORAGE_KEY,
  MARKETPLACE_UPDATE_PENDING_STORAGE_KEY,
} from "@prism/schema/marketplace-bridge";
import type { MarketplaceStorage } from "./marketplace-service-worker.js";
import {
  checkMarketplaceUpdatesForImportedMods,
  mergeAutoMarketplaceUpdates,
  pickFirstUpdatePending,
  type MarketplaceUpdatePending,
} from "./marketplace-updates.js";

export async function readMarketplaceUpdatePending(
  storage: MarketplaceStorage,
): Promise<MarketplaceUpdatePending | undefined> {
  const stored = await storage.get(MARKETPLACE_UPDATE_PENDING_STORAGE_KEY);
  const pending = stored[MARKETPLACE_UPDATE_PENDING_STORAGE_KEY];
  if (typeof pending !== "object" || pending === null || Array.isArray(pending)) {
    return undefined;
  }
  const record = pending as Record<string, unknown>;
  if (
    typeof record.packageId !== "string" ||
    typeof record.fromVersion !== "string" ||
    typeof record.toVersion !== "string" ||
    typeof record.name !== "string" ||
    typeof record.author !== "string" ||
    typeof record.archive !== "string" ||
    !Array.isArray(record.capabilityIncreases) ||
    !Array.isArray(record.requiredCapabilities) ||
    !Array.isArray(record.optionalCapabilities)
  ) {
    return undefined;
  }
  return {
    packageId: record.packageId,
    fromVersion: record.fromVersion,
    toVersion: record.toVersion,
    name: record.name,
    author: record.author,
    requiredCapabilities: record.requiredCapabilities.filter(
      (value): value is string => typeof value === "string",
    ),
    optionalCapabilities: record.optionalCapabilities.filter(
      (value): value is string => typeof value === "string",
    ),
    capabilityIncreases: record.capabilityIncreases.filter(
      (value): value is string => typeof value === "string",
    ),
    archive: record.archive,
  };
}

export async function clearMarketplaceUpdatePending(
  storage: MarketplaceStorage,
): Promise<void> {
  await storage.remove(MARKETPLACE_UPDATE_PENDING_STORAGE_KEY);
}

export async function runMarketplaceUpdateCheck(options: {
  readonly extensionVersion: string;
  readonly fetchImpl: typeof fetch;
  readonly storage: MarketplaceStorage;
  readonly getState: () => Promise<{
    importedArchives?: Record<string, string>;
    enabled?: Record<string, boolean>;
    grants?: Record<string, readonly string[]>;
  }>;
  readonly setState: (patch: Record<string, unknown>) => Promise<void>;
  readonly force?: boolean;
}): Promise<{ readonly ok: boolean; readonly error?: string }> {
  const state = await options.getState();
  const importedArchives = state.importedArchives ?? {};
  if (Object.keys(importedArchives).length === 0) {
    return { ok: true };
  }

  const lastStored = await options.storage.get(MARKETPLACE_UPDATE_LAST_CHECK_STORAGE_KEY);
  const lastCheck =
    typeof lastStored[MARKETPLACE_UPDATE_LAST_CHECK_STORAGE_KEY] === "number"
      ? lastStored[MARKETPLACE_UPDATE_LAST_CHECK_STORAGE_KEY]
      : 0;
  if (
    options.force !== true &&
    Date.now() - lastCheck < MARKETPLACE_UPDATE_CHECK_INTERVAL_MS
  ) {
    return { ok: true };
  }

  const result = await checkMarketplaceUpdatesForImportedMods({
    importedArchives,
    extensionVersion: options.extensionVersion,
    fetchImpl: options.fetchImpl,
  });
  await options.storage.set({
    [MARKETPLACE_UPDATE_LAST_CHECK_STORAGE_KEY]: Date.now(),
  });
  if (!result.ok) {
    return result;
  }

  if (result.autoUpdates.length > 0) {
    const nextArchives = mergeAutoMarketplaceUpdates(
      importedArchives,
      result.autoUpdates,
    );
    await options.setState({ importedArchives: nextArchives });
  }

  const pending = pickFirstUpdatePending(result.pendingReapproval);
  if (pending !== undefined) {
    await options.storage.set({
      [MARKETPLACE_UPDATE_PENDING_STORAGE_KEY]: pending,
    });
  }

  return { ok: true };
}

export async function confirmMarketplaceUpdate(options: {
  readonly pending: MarketplaceUpdatePending;
  readonly importedArchives: Record<string, string>;
}): Promise<{ importedArchives: Record<string, string> }> {
  return {
    importedArchives: {
      ...options.importedArchives,
      [options.pending.packageId]: options.pending.archive,
    },
  };
}
