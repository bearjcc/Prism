import { describe, expect, it } from "vitest";
import {
  DEV_CATALOGUE_ORIGIN,
  MARKETPLACE_BRIDGE_VERSION,
  MARKETPLACE_INSTALL_REQUEST_TYPE,
  MARKETPLACE_PAGE_SOURCE,
  MARKETPLACE_PING_TYPE,
  PRODUCTION_CATALOGUE_ORIGIN,
  compareExtensionVersions,
  extensionMeetsMinimum,
  parseMarketplaceInstallRequest,
  parseMarketplacePing,
} from "./marketplace-bridge.js";

describe("marketplace bridge origins", () => {
  it("allows production and local dev catalogue origins only", () => {
    expect(parseMarketplacePing(
      {
        source: MARKETPLACE_PAGE_SOURCE,
        type: MARKETPLACE_PING_TYPE,
        bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
      },
      PRODUCTION_CATALOGUE_ORIGIN,
    ).ok).toBe(true);
    expect(parseMarketplacePing(
      {
        source: MARKETPLACE_PAGE_SOURCE,
        type: MARKETPLACE_PING_TYPE,
        bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
      },
      DEV_CATALOGUE_ORIGIN,
    ).ok).toBe(true);
    expect(parseMarketplacePing(
      {
        source: MARKETPLACE_PAGE_SOURCE,
        type: MARKETPLACE_PING_TYPE,
        bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
      },
      "https://evil.example",
    ).ok).toBe(false);
  });
});

describe("marketplace install request", () => {
  it("accepts package id and version from the catalogue origin", () => {
    expect(
      parseMarketplaceInstallRequest(
        {
          source: MARKETPLACE_PAGE_SOURCE,
          type: MARKETPLACE_INSTALL_REQUEST_TYPE,
          bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
          packageId: "prism.immich-upload",
          version: "1.0.0",
        },
        PRODUCTION_CATALOGUE_ORIGIN,
      ),
    ).toEqual({
      ok: true,
      packageId: "prism.immich-upload",
      version: "1.0.0",
    });
  });

  it("rejects malformed ids, versions, and foreign origins", () => {
    expect(
      parseMarketplaceInstallRequest(
        {
          source: MARKETPLACE_PAGE_SOURCE,
          type: MARKETPLACE_INSTALL_REQUEST_TYPE,
          bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
          packageId: "not-a-package-id",
          version: "1.0.0",
        },
        PRODUCTION_CATALOGUE_ORIGIN,
      ).ok,
    ).toBe(false);
    expect(
      parseMarketplaceInstallRequest(
        {
          source: MARKETPLACE_PAGE_SOURCE,
          type: MARKETPLACE_INSTALL_REQUEST_TYPE,
          bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
          packageId: "prism.immich-upload",
          version: "v1",
        },
        PRODUCTION_CATALOGUE_ORIGIN,
      ).ok,
    ).toBe(false);
    expect(
      parseMarketplaceInstallRequest(
        {
          source: MARKETPLACE_PAGE_SOURCE,
          type: MARKETPLACE_INSTALL_REQUEST_TYPE,
          bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
          packageId: "prism.immich-upload",
          version: "1.0.0",
        },
        "https://evil.example",
      ).ok,
    ).toBe(false);
  });
});

describe("extension version compare", () => {
  it("orders semver-like extension versions", () => {
    expect(compareExtensionVersions("0.1.2", "0.1.1")).toBeGreaterThan(0);
    expect(extensionMeetsMinimum("0.1.2", "0.1.2")).toBe(true);
    expect(extensionMeetsMinimum("0.1.1", "0.1.2")).toBe(false);
  });
});
