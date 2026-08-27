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
  test("compiles TypeScript, ignores DNS filters, zips, and hashes", () => {
    const packed = packMod(goldenDir);
    const files = unzipSync(packed.archive);

    expect(Object.keys(files).sort()).toEqual([
      "assets/kitten.txt",
      "filters/browser/ads.txt",
      "prism.yaml",
      "src/index.js",
    ]);
    expect(strFromU8(files["src/index.js"] ?? new Uint8Array())).toContain(
      "export const kitten",
    );
    expect(files["src/index.ts"]).toBeUndefined();
    expect(files["filters/dns/ignored.txt"]).toBeUndefined();
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

  test("reports heuristic source warnings without blocking the pack", () => {
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

    const packed = packMod(directory);

    expect(packed.warnings.map((warning) => warning.term)).toEqual([
      "fetch",
      "document",
    ]);
  });
});

function makeTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "prism-schema-"));
  temporaryDirectories.push(directory);
  return directory;
}
