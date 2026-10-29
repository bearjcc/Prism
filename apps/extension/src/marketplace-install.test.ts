import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  catalogueIndexUrl,
  catalogueSignatureUrl,
  packageUrl,
} from "@prism/schema/marketplace-catalogue";
import {
  downloadVerifiedMarketplacePackage,
  loadVerifiedCatalogueIndex,
  prepareMarketplaceInstallPending,
  type FetchLike,
} from "./marketplace-install.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("marketplace install pipeline", () => {
  const origin = "http://localhost:3000";

  it("refuses a package when the digest does not match the signed index", async () => {
    const indexBytes = readFileSync(
      join(repoRoot, "apps", "web", "public", "catalogue-index.json"),
    );
    const signature = readFileSync(
      join(repoRoot, "apps", "web", "public", "catalogue-index.sig"),
      "utf8",
    );
    const archive = readFileSync(
      join(repoRoot, "apps", "web", "public", "packages", "kitten-ad-replace.prism"),
    );
    const tampered = Buffer.from(archive);
    tampered[10] ^= 0xff;
    const fetchImpl: FetchLike = async (url) => {
      if (url === catalogueIndexUrl(origin)) {
        return {
          ok: true,
          text: async () => indexBytes.toString("utf8"),
          arrayBuffer: async () => indexBytes.buffer,
        };
      }
      if (url === catalogueSignatureUrl(origin)) {
        return { ok: true, text: async () => signature, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      if (url === packageUrl(origin, "/packages/kitten-ad-replace.prism")) {
        return {
          ok: true,
          text: async () => "",
          arrayBuffer: async () => tampered.buffer.slice(tampered.byteOffset, tampered.byteOffset + tampered.byteLength),
        };
      }
      return { ok: false, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const index = await loadVerifiedCatalogueIndex(origin, fetchImpl);
    const release = index.releases.find((entry) => entry.slug === "kitten-ad-replace");
    expect(release).toBeDefined();
    await expect(
      downloadVerifiedMarketplacePackage(origin, release!, fetchImpl),
    ).rejects.toThrow(/digest mismatch/u);
  });

  it("refuses when the archive manifest id does not match the requested package id", async () => {
    const indexBytes = readFileSync(
      join(repoRoot, "apps", "web", "public", "catalogue-index.json"),
    );
    const signature = readFileSync(
      join(repoRoot, "apps", "web", "public", "catalogue-index.sig"),
      "utf8",
    );
    const archive = readFileSync(
      join(repoRoot, "apps", "web", "public", "packages", "kitten-ad-replace.prism"),
    );
    const fetchImpl: FetchLike = async (url) => {
      if (url === catalogueIndexUrl(origin)) {
        return {
          ok: true,
          text: async () => indexBytes.toString("utf8"),
          arrayBuffer: async () => indexBytes.buffer,
        };
      }
      if (url === catalogueSignatureUrl(origin)) {
        return { ok: true, text: async () => signature, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      if (url === packageUrl(origin, "/packages/kitten-ad-replace.prism")) {
        return {
          ok: true,
          text: async () => "",
          arrayBuffer: async () =>
            archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength),
        };
      }
      return { ok: false, text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    };
    const result = await prepareMarketplaceInstallPending({
      catalogueOrigin: origin,
      packageId: "prism.does-not-exist",
      version: "1.0.0",
      extensionVersion: "0.1.2",
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/signed catalogue|mismatch/id);
    }
  });

  it("ignores archive bytes on install requests from the page", async () => {
    const { parseMarketplaceInstallRequest } = await import(
      "@prism/schema/marketplace-bridge"
    );
    expect(
      parseMarketplaceInstallRequest(
        {
          source: "webprism-catalogue",
          type: "prism/marketplace/install-request",
          bridgeVersion: 1,
          packageId: "prism.kitten-ad-replace",
          version: "1.0.0",
          archive: "YmFkcGFk",
        },
        "https://webprism.app",
      ),
    ).toEqual({
      ok: true,
      packageId: "prism.kitten-ad-replace",
      version: "1.0.0",
    });
  });
});
