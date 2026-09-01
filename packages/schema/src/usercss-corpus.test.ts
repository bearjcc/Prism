import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { compileUserCss } from "./css.js";
import { packMod } from "./pack.js";
import { mapUserCss } from "./usercss-map.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const usercssRoot = join(repoRoot, "corpus", "usercss");
const FORBIDDEN_IN_OUTPUT = /@import\b|\burl\s*\(/iu;
const FORBIDDEN_REJECT = /forbidden (?:preprocessor|update URL|@import|url\()/u;

type Outcome = "accepted" | "sanitised" | "rejected";

function posixRelative(from: string, to: string): string {
  return relative(from, to).split("\\").join("/");
}

function corpusPackages(): string[] {
  if (!existsSync(usercssRoot)) {
    return [];
  }
  return readdirSync(usercssRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(usercssRoot, entry.name))
    .filter((directory) => existsSync(join(directory, "prism.yaml")))
    .sort();
}

function styleFiles(directory: string): string[] {
  const styles = join(directory, "styles");
  if (!existsSync(styles)) {
    return [];
  }
  return readdirSync(styles)
    .filter((name) => /\.(?:css|less)$/iu.test(name))
    .map((name) => join(styles, name))
    .sort();
}

function classify(source: string): { outcome: Outcome; compiled?: string; error?: string } {
  try {
    const compiled = compileUserCss(source);
    return {
      outcome: compiled === source ? "accepted" : "sanitised",
      compiled,
    };
  } catch (error) {
    return {
      outcome: "rejected",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

describe("corpus UserCSS compileUserCss", () => {
  const packages = corpusPackages();
  const files = packages.flatMap((directory) => styleFiles(directory));

  test("discovers corpus/usercss packages and style files", () => {
    expect(
      packages.length,
      "run node scripts/sync-corpus-from-references.mjs",
    ).toBeGreaterThan(0);
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => file.toLowerCase().endsWith(".less"))).toBe(
      true,
    );
  });

  test("records accepted / sanitised / rejected counts and fails closed", () => {
    const counts = { accepted: 0, sanitised: 0, rejected: 0 };
    const byFile: Array<{
      path: string;
      outcome: Outcome;
      error?: string;
    }> = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const result = classify(source);
      counts[result.outcome] += 1;
      byFile.push({
        path: posixRelative(repoRoot, file),
        outcome: result.outcome,
        error: result.error,
      });

      if (result.outcome === "rejected") {
        expect(result.error, file).toMatch(FORBIDDEN_REJECT);
        continue;
      }

      expect(result.compiled, file).toBeDefined();
      expect(result.compiled, file).not.toMatch(FORBIDDEN_IN_OUTPUT);
      expect(result.compiled, file).not.toMatch(/@-moz-document/u);
      expect(result.compiled, file).not.toMatch(/==UserStyle==/u);
      const mapped = mapUserCss(source);
      expect(mapped.apply, file).not.toMatch(FORBIDDEN_IN_OUTPUT);
      for (const hide of mapped.hides) {
        expect(hide.capability).toBe("visual.hide");
        expect(hide.selector).not.toMatch(/@|url\s*\(/iu);
      }
    }

    expect(
      counts,
      JSON.stringify(byFile, null, 2),
    ).toEqual({ accepted: 1, sanitised: 1, rejected: 1 });
    expect(counts.accepted + counts.sanitised + counts.rejected).toBe(
      files.length,
    );

    const lessFiles = byFile.filter((entry) =>
      entry.path.toLowerCase().endsWith(".less"),
    );
    expect(lessFiles.length).toBeGreaterThan(0);
    for (const entry of lessFiles) {
      expect(entry.outcome).toBe("rejected");
      expect(entry.error).toMatch(/preprocessor/u);
    }

    expect(() => compileUserCss('@import "https://x.test/a.css";')).toThrow(
      /@import/u,
    );
    expect(() =>
      compileUserCss("a { background: url(https://x.test/a.png); }"),
    ).toThrow(/url\(/u);
  });

  test("prism.yaml packages pack only when every style compiles", () => {
    for (const directory of packages) {
      const filesInPackage = styleFiles(directory);
      const outcomes = filesInPackage.map(
        (file) => classify(readFileSync(file, "utf8")).outcome,
      );
      if (outcomes.includes("rejected")) {
        expect(() => packMod(directory)).toThrow(FORBIDDEN_REJECT);
        continue;
      }
      const packed = packMod(directory);
      expect(packed.manifest.id).toMatch(/^prism\.corpus\./u);
    }
  });
});
