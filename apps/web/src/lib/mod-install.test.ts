import { describe, expect, it } from "vitest";
import { LISTINGS } from "./catalogue";
import { bundledEntryPath } from "./extension-store";
import { modInstallSteps, packageDownloadPath } from "./mod-install";

describe("mod install helpers", () => {
  it("builds bundled entry paths from package ids", () => {
    expect(bundledEntryPath("prism.youtube-home-videos")).toBe(
      "bundled-mods/prism.youtube-home-videos/src/index.js",
    );
    expect(bundledEntryPath("prism.linkedin-home-first-degree")).toBe(
      "bundled-mods/prism.linkedin-home-first-degree/src/index.js",
    );
    expect(bundledEntryPath("prism.facebook-home-friends")).toBe(
      "bundled-mods/prism.facebook-home-friends/src/index.js",
    );
  });

  it("points downloads at public package files", () => {
    for (const listing of LISTINGS) {
      expect(packageDownloadPath(listing.id)).toBe(`/packages/${listing.id}.prism`);
    }
  });

  it("documents extension-first install steps", () => {
    const steps = modInstallSteps(LISTINGS[0]!);
    expect(steps).toHaveLength(3);
    expect(steps[0]?.title).toMatch(/Prism extension/i);
    expect(steps[1]?.detail).toContain("prism.kitten-ad-replace");
    expect(steps[2]?.detail).toMatch(/\.prism/);
  });
});
