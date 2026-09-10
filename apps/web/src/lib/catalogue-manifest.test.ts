/** @vitest-environment node */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateManifest } from "@prism/schema/validate";
import { LISTINGS, catalogue } from "./catalogue";
import { bundledEntryPath } from "./extension-store";
import { listModManifestPaths } from "../../../../scripts/check-mods-engine.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

describe("catalogue manifest sync", () => {
  it("lists only the five homegrown tracer mods", () => {
    expect(LISTINGS.map((listing) => listing.id)).toEqual([
      "kitten-ad-replace",
      "youtube-home-videos",
      "youtube-reddit-comments",
      "linkedin-home-first-degree",
      "facebook-home-friends",
    ]);
    expect(catalogue()).toHaveLength(5);
  });

  it("matches each listing to mods/*/prism.yaml", () => {
    const manifestPaths = listModManifestPaths(join(repoRoot, "mods"));

    for (const listing of LISTINGS) {
      const manifestPath = join(repoRoot, "mods", listing.id, "prism.yaml");
      expect(manifestPaths).toContain(manifestPath);
      const source = readFileSync(manifestPath, "utf8");
      const manifest = validateManifest(source, manifestPath);

      expect(listing.packageId).toBe(manifest.id);
      expect(listing.version).toBe(manifest.version);
      expect(listing.runtime).toBe(manifest.runtime);
      expect([...listing.scopes]).toEqual([...manifest.scopes]);
      expect(listing.bundledEntry).toBe(bundledEntryPath(manifest.id));

      const required = manifest.capabilities.required;
      const optional = manifest.capabilities.optional ?? [];
      for (const cap of listing.capabilities.filter((c) => c.required)) {
        expect(required, cap.id).toContain(cap.id);
      }
      for (const cap of listing.capabilities.filter((c) => !c.required)) {
        expect(optional, cap.id).toContain(cap.id);
      }
      expect(listing.capabilities).toHaveLength(required.length + optional.length);
    }
  });

  it("has preview assets for listings with previewSrc", () => {
    for (const listing of LISTINGS) {
      if (listing.previewSrc === undefined) {
        continue;
      }
      expect(
        existsSync(join(repoRoot, "apps", "web", "public", listing.previewSrc)),
      ).toBe(true);
    }
  });
});
