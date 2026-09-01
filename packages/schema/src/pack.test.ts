import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, describe, expect, test } from "vitest";
import {
  loadPackedMod,
  loadUnpackedMod,
  packMod,
} from "./pack.js";
import { ManifestValidationError } from "./validate.js";

const schemaRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const goldenDir = join(schemaRoot, "test", "fixtures", "golden");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("packMod", () => {
  test("compiles TypeScript, zips, and hashes", () => {
    const packed = packMod(goldenDir);
    const files = unzipSync(packed.archive);

    expect(Object.keys(files).sort()).toEqual([
      "assets/kitten.txt",
      "filters/browser/ads.txt",
      "prism.yaml",
      "src/index.js",
    ]);
    expect(strFromU8(files["src/index.js"] ?? new Uint8Array())).toContain(
      "export function activate",
    );
    expect(files["src/index.ts"]).toBeUndefined();
    expect(packed.contentHash).toBe(
      createHash("sha256").update(packed.archive).digest("hex"),
    );
  });

  test("loads packed and unpacked mods through manifest validation", () => {
    const packed = packMod(goldenDir);

    expect(loadUnpackedMod(goldenDir).manifest.id).toBe("golden.mod");
    expect(loadPackedMod(packed.archive, "golden.prism").manifest.id).toBe(
      "golden.mod",
    );
  });

  test("refuses filters/dns and gateway zip entries when loading a packed mod", () => {
    const packed = packMod(goldenDir);
    const files = unzipSync(packed.archive);
    const archiveWithDeferredTrees = zipSync({
      ...files,
      "filters/dns/ignored.txt": strToU8("dns\n"),
      "gateway/proxy.yaml": strToU8("proxy: true\n"),
    });

    expect(() =>
      loadPackedMod(archiveWithDeferredTrees, "golden.prism"),
    ).toThrow(/not supported/u);
  });

  test("fails closed for invalid unpacked and packed manifests", () => {
    const directory = makeTemporaryDirectory();
    writeFileSync(join(directory, "prism.yaml"), "runtime: native\n", "utf8");
    const archive = zipSync({
      "prism.yaml": strToU8("runtime: native\n"),
    });

    expect(() => loadUnpackedMod(directory)).toThrow(ManifestValidationError);
    expect(() => loadPackedMod(archive, "invalid.prism")).toThrow(
      ManifestValidationError,
    );
  });

  test("still compiles userscript TypeScript into the zip", () => {
    const directory = makeTemporaryDirectory();
    writeFileSync(
      join(directory, "prism.yaml"),
      `id: fixture.userscript
version: 1.0.0
runtime: userscript
capabilities:
  required: []
scopes:
  - https://example.com/*
`,
      "utf8",
    );
    mkdirSync(join(directory, "src"));
    writeFileSync(
      join(directory, "src", "index.ts"),
      "export const marker = 'userscript-body';\n",
      "utf8",
    );

    const packed = packMod(directory);
    const files = unzipSync(packed.archive);

    expect(packed.manifest.runtime).toBe("userscript");
    expect(strFromU8(files["src/index.js"] ?? new Uint8Array())).toContain(
      "userscript-body",
    );
  });

  test("rejects native source that reaches page or network globals", () => {
    const directory = makeTemporaryDirectory();
    writeFileSync(
      join(directory, "prism.yaml"),
      readFileSync(join(goldenDir, "prism.yaml"), "utf8"),
      "utf8",
    );
    mkdirSync(join(directory, "src"));
    writeFileSync(
      join(directory, "src", "index.ts"),
      "export const unsafe = () => fetch(document.URL);\n",
      "utf8",
    );

    expect(() => packMod(directory)).toThrow(/not available to native mod code/u);
  });

  test("rejects styles that fail CSS sanitise", () => {
    const directory = makeTemporaryDirectory();
    writeFileSync(
      join(directory, "prism.yaml"),
      readFileSync(join(goldenDir, "prism.yaml"), "utf8"),
      "utf8",
    );
    mkdirSync(join(directory, "styles"));
    writeFileSync(
      join(directory, "styles", "unsafe.css"),
      "@import url(https://example.test/x.css);\n",
      "utf8",
    );

    expect(() => packMod(directory)).toThrow(/forbidden/u);
  });
});

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "prism-schema-"));
  temporaryDirectories.push(directory);
  return directory;
}
