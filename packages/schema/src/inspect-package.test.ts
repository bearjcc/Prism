import { describe, expect, test } from "vitest";
import type { PrismManifest } from "./manifest.js";
import { inspectPackage } from "./inspect-package.js";

const manifest: PrismManifest = {
  id: "example.mod",
  version: "1.0.0",
  runtime: "native",
  capabilities: { required: ["visual.hide"] },
  scopes: ["https://example.test/*"],
};

function files(
  entries: Readonly<Record<string, string>>,
): Record<string, Uint8Array> {
  return Object.fromEntries(
    Object.entries(entries).map(([path, source]) => [
      path,
      new TextEncoder().encode(source),
    ]),
  );
}

describe("inspectPackage", () => {
  test("accepts a native prism-only package", () => {
    const result = inspectPackage(
      manifest,
      files({
        "src/index.js":
          "export function activate(prism) { prism.extract('visual.hide'); }",
      }),
    );

    expect(result).toEqual({ ok: true, findings: [] });
  });

  test("rejects page and extension globals", () => {
    const result = inspectPackage(
      manifest,
      files({
        "src/index.js":
          "export function activate(prism) { return document.body || chrome.runtime; }",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.message)).toEqual([
      "document is not available to native mod code",
      "chrome is not available to native mod code",
    ]);
  });

  test("rejects unknown native globals and dynamic imports", () => {
    const result = inspectPackage(
      manifest,
      files({
        "src/index.js":
          "export async function activate(prism) { await import('x'); return helper(prism); }",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.findings.map((finding) => finding.message)).toEqual([
      "dynamic import is not allowed",
      "helper is not available to native mod code",
    ]);
  });

  test("rejects CSS outside the property and at-rule allowlists", () => {
    const result = inspectPackage(
      manifest,
      files({
        "styles/main.css":
          "@supports (display: grid) { .x { unknown-property: grid; } }",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "css", message: "CSS at-rule @supports is not allowlisted" }),
        expect.objectContaining({ kind: "css", message: "CSS property unknown-property is not allowlisted" }),
      ]),
    );
  });

  test("rejects unsafe browser filters and unsupported DNS paths", () => {
    const result = inspectPackage(
      manifest,
      files({
        "filters/browser/ads.txt": "||ads.example^\nexample.com##.ad{color:red}",
        "filters/dns/hosts.txt": "ads.example",
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "filter" }),
        expect.objectContaining({ kind: "path", file: "filters/dns/hosts.txt" }),
      ]),
    );
  });
});
