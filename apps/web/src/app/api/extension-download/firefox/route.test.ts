import { describe, expect, it, vi, afterEach } from "vitest";

const { fetchLatestExtensionRelease } = vi.hoisted(() => ({
  fetchLatestExtensionRelease: vi.fn(),
}));

vi.mock("../../../../lib/github-extension-release", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/github-extension-release")>();
  return {
    ...actual,
    fetchLatestExtensionRelease,
  };
});

import { EXTENSION_RELEASE_ASSETS } from "../../../../lib/github-extension-release";
import { GET } from "./route";

describe("GET /api/extension-download/firefox", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchLatestExtensionRelease.mockReset();
  });

  it("returns 404 when signed asset is missing", async () => {
    fetchLatestExtensionRelease.mockResolvedValue({
      tagName: "v0.1.2",
      version: "0.1.2",
      publishedAt: "2026-01-01T00:00:00Z",
      htmlUrl: "https://example.com",
      assets: [],
    });
    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("proxies signed XPI with xpinstall content type", async () => {
    fetchLatestExtensionRelease.mockResolvedValue({
      tagName: "v0.1.2",
      version: "0.1.2",
      publishedAt: "2026-01-01T00:00:00Z",
      htmlUrl: "https://example.com",
      assets: [
        {
          name: EXTENSION_RELEASE_ASSETS.firefoxSignedXpi,
          downloadUrl: "https://example.com/signed.xpi",
          size: 10,
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("xpi-bytes", { status: 200 })),
    );
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/x-xpinstall");
  });
});
