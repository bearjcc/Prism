import {
  isCataloguePackageOrigin,
  DEV_CATALOGUE_ORIGIN,
  PRODUCTION_CATALOGUE_ORIGIN,
  catalogueOriginsForPackages,
} from "./marketplace-catalogue.js";

export const MARKETPLACE_BRIDGE_VERSION = 1 as const;

export const MARKETPLACE_EXTENSION_SOURCE = "prism-extension";
export const MARKETPLACE_PAGE_SOURCE = "webprism-catalogue";

export const MARKETPLACE_PING_TYPE = "prism/marketplace/ping";
export const MARKETPLACE_PONG_TYPE = "prism/marketplace/pong";
export const MARKETPLACE_INSTALL_REQUEST_TYPE = "prism/marketplace/install-request";
export const MARKETPLACE_INSTALL_ACK_TYPE = "prism/marketplace/install-ack";
export const MARKETPLACE_INSTALL_RESULT_TYPE = "prism/marketplace/install-result";

export {
  DEV_CATALOGUE_ORIGIN,
  PRODUCTION_CATALOGUE_ORIGIN,
  catalogueOriginsForPackages as catalogueOrigins,
  isCataloguePackageOrigin,
  isCataloguePackageOrigin as isCatalogueOrigin,
};

export const MARKETPLACE_ENABLE_PENDING_STORAGE_KEY = "marketplaceInstallPending";

export const MARKETPLACE_UPDATE_PENDING_STORAGE_KEY = "marketplaceUpdatePending";
export const MARKETPLACE_UPDATE_LAST_CHECK_STORAGE_KEY = "marketplaceUpdateLastCheckMs";
export const MARKETPLACE_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type InstalledModSummary = {
  readonly packageId: string;
  readonly version: string;
  readonly enabled: boolean;
};

export type MarketplacePongPayload = {
  readonly source: typeof MARKETPLACE_EXTENSION_SOURCE;
  readonly type: typeof MARKETPLACE_PONG_TYPE;
  readonly bridgeVersion: typeof MARKETPLACE_BRIDGE_VERSION;
  readonly extensionVersion: string;
  readonly installedMods: readonly InstalledModSummary[];
};

export type MarketplaceInstallRequestPayload = {
  readonly source: typeof MARKETPLACE_PAGE_SOURCE;
  readonly type: typeof MARKETPLACE_INSTALL_REQUEST_TYPE;
  readonly bridgeVersion: typeof MARKETPLACE_BRIDGE_VERSION;
  readonly packageId: string;
  readonly version: string;
};

export type MarketplaceInstallAckPayload = {
  readonly source: typeof MARKETPLACE_EXTENSION_SOURCE;
  readonly type: typeof MARKETPLACE_INSTALL_ACK_TYPE;
  readonly bridgeVersion: typeof MARKETPLACE_BRIDGE_VERSION;
  readonly packageId: string;
};

export type MarketplaceInstallResultPayload = {
  readonly source: typeof MARKETPLACE_EXTENSION_SOURCE;
  readonly type: typeof MARKETPLACE_INSTALL_RESULT_TYPE;
  readonly bridgeVersion: typeof MARKETPLACE_BRIDGE_VERSION;
  readonly packageId: string;
  readonly ok: boolean;
  readonly error?: string;
};

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseMarketplacePing(
  data: unknown,
  pageOrigin: string,
): { readonly ok: true } | { readonly ok: false } {
  if (!isCataloguePackageOrigin(pageOrigin)) {
    return { ok: false };
  }
  if (!isPlainRecord(data)) {
    return { ok: false };
  }
  if (
    data.source !== MARKETPLACE_PAGE_SOURCE ||
    data.type !== MARKETPLACE_PING_TYPE ||
    data.bridgeVersion !== MARKETPLACE_BRIDGE_VERSION
  ) {
    return { ok: false };
  }
  return { ok: true };
}

export function parseMarketplaceInstallRequest(
  data: unknown,
  pageOrigin: string,
):
  | { readonly ok: true; readonly packageId: string; readonly version: string }
  | { readonly ok: false } {
  if (!isCataloguePackageOrigin(pageOrigin)) {
    return { ok: false };
  }
  if (!isPlainRecord(data)) {
    return { ok: false };
  }
  if (
    data.source !== MARKETPLACE_PAGE_SOURCE ||
    data.type !== MARKETPLACE_INSTALL_REQUEST_TYPE ||
    data.bridgeVersion !== MARKETPLACE_BRIDGE_VERSION
  ) {
    return { ok: false };
  }
  if (
    typeof data.packageId !== "string" ||
    !/^prism\.[a-z0-9.-]+$/u.test(data.packageId) ||
    typeof data.version !== "string" ||
    !/^[0-9]+\.[0-9]+\.[0-9]+$/u.test(data.version)
  ) {
    return { ok: false };
  }
  return { ok: true, packageId: data.packageId, version: data.version };
}

export function compareExtensionVersions(left: string, right: string): number {
  const parse = (value: string): number[] =>
    value.split(".").map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    });
  const leftParts = parse(left);
  const rightParts = parse(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

export function extensionMeetsMinimum(
  installedVersion: string,
  minimumVersion: string,
): boolean {
  return compareExtensionVersions(installedVersion, minimumVersion) >= 0;
}
