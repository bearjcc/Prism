import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  constantTimeEqualHex,
  findCatalogueRelease,
  parseCatalogueIndex,
} from "./marketplace-catalogue.js";
import {
  sha256Hex,
  verifyCatalogueIndexSignatureNode,
} from "./marketplace-catalogue-node.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("marketplace catalogue index", () => {
  it("verifies a generated fixture index and release lookup", () => {
    execFileSync(process.execPath, ["scripts/prepare-web-build.mjs"], {
      cwd: repoRoot,
    });
    const indexPath = join(
      repoRoot,
      "apps",
      "web",
      "public",
      "catalogue-index.json",
    );
    const sigPath = join(
      repoRoot,
      "apps",
      "web",
      "public",
      "catalogue-index.sig",
    );
    const indexBytes = readFileSync(indexPath);
    const signature = readFileSync(sigPath, "utf8");
    expect(
      verifyCatalogueIndexSignatureNode(new Uint8Array(indexBytes), signature),
    ).toBe(true);
    const index = parseCatalogueIndex(indexBytes.toString("utf8"));
    const release = findCatalogueRelease(
      index,
      "prism.kitten-ad-replace",
      "1.0.0",
    );
    expect(release?.slug).toBe("kitten-ad-replace");
    const archive = readFileSync(
      join(repoRoot, "apps", "web", "public", "packages", "kitten-ad-replace.prism"),
    );
    expect(constantTimeEqualHex(sha256Hex(new Uint8Array(archive)), release!.sha256)).toBe(
      true,
    );
  });

  it("rejects a tampered index signature", () => {
    execFileSync(process.execPath, ["scripts/prepare-web-build.mjs"], {
      cwd: repoRoot,
    });
    const indexPath = join(
      repoRoot,
      "apps",
      "web",
      "public",
      "catalogue-index.json",
    );
    const sigPath = join(
      repoRoot,
      "apps",
      "web",
      "public",
      "catalogue-index.sig",
    );
    const tampered = Buffer.from(readFileSync(indexPath));
    tampered[tampered.length - 2] ^= 0xff;
    const signature = readFileSync(sigPath, "utf8");
    expect(
      verifyCatalogueIndexSignatureNode(new Uint8Array(tampered), signature),
    ).toBe(false);
  });
});
