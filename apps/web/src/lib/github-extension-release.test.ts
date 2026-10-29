import { describe, expect, it, vi } from "vitest";
import {
  EXTENSION_RELEASE_ASSETS,
  fetchLatestExtensionRelease,
  findReleaseAsset,
  firefoxSignedInstallAvailable,
  formatReleaseDate,
  parseGitHubRelease,
} from "./github-extension-release";

describe("github extension release", () => {
  it("parses GitHub release JSON", () => {
    const release = parseGitHubRelease({
      tag_name: "v0.1.2",
      published_at: "2026-01-15T12:00:00Z",
      html_url: "https://github.com/bearjcc/Prism/releases/tag/v0.1.2",
      assets: [
        {
          name: "prism-chromium-unpacked.zip",
          browser_download_url: "https://example.com/chromium.zip",
          size: 1000,
        },
        {
          name: "prism-firefox-signed.xpi",
          browser_download_url: "https://example.com/signed.xpi",
          size: 2000,
        },
      ],
    });
    expect(release?.version).toBe("0.1.2");
    expect(findReleaseAsset(release!, EXTENSION_RELEASE_ASSETS.chromiumZip)?.downloadUrl).toBe(
      "https://example.com/chromium.zip",
    );
    expect(firefoxSignedInstallAvailable(release!)).toBe(true);
  });

  it("formats release dates", () => {
    expect(formatReleaseDate("2026-01-15T12:00:00Z", "en-NZ")).toMatch(/2026/);
  });

  it("fetches latest release via GitHub API", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        tag_name: "v0.1.2",
        published_at: "2026-01-15T12:00:00Z",
        html_url: "https://github.com/bearjcc/Prism/releases/tag/v0.1.2",
        assets: [],
      }),
    );
    const release = await fetchLatestExtensionRelease({ fetchImpl });
    expect(release?.tagName).toBe("v0.1.2");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/bearjcc/Prism/releases/latest",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });
});
