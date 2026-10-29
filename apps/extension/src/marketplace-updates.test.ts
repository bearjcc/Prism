import { describe, expect, it } from "vitest";
import {
  capabilityIncreasesForUpdate,
  catalogueVersionIsNewer,
  mergeAutoMarketplaceUpdates,
} from "./marketplace-updates.js";
import type { PrismManifest } from "@prism/schema";

const baseManifest = (patch: Partial<PrismManifest>): PrismManifest =>
  ({
    id: "prism.test-mod",
    version: "1.0.0",
    name: "Test",
    runtime: "native",
    scopes: ["https://example.com/*"],
    capabilities: { required: ["visual.hide"], optional: [] },
    ...patch,
  }) as PrismManifest;

describe("marketplace updates", () => {
  it("detects newer catalogue semver", () => {
    expect(catalogueVersionIsNewer("1.0.0", "1.0.1")).toBe(true);
    expect(catalogueVersionIsNewer("1.0.1", "1.0.0")).toBe(false);
  });

  it("flags capability increases for reapproval", () => {
    const before = baseManifest({});
    const after = baseManifest({
      version: "1.0.1",
      capabilities: {
        required: ["visual.hide", "network.egress"],
        optional: [],
      },
    });
    expect(capabilityIncreasesForUpdate(before, after).length).toBeGreaterThan(0);
  });

  it("merges auto updates into imported archives", () => {
    const merged = mergeAutoMarketplaceUpdates(
      { "prism.test-mod": "old" },
      [
        {
          packageId: "prism.test-mod",
          archive: "new",
          release: {
            slug: "test-mod",
            packageId: "prism.test-mod",
            version: "1.0.1",
            sha256: "a".repeat(64),
            packagePath: "/packages/test-mod.prism",
            name: "Test",
            author: "Prism",
            requiredCapabilities: ["visual.hide"],
            optionalCapabilities: [],
          },
        },
      ],
    );
    expect(merged["prism.test-mod"]).toBe("new");
  });
});
