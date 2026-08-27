import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as ts from "typescript";
import type { PrismManifest } from "./manifest.js";
import { validateManifest } from "./validate.js";

export interface PackWarning {
  readonly file: string;
  readonly line: number;
  readonly term: "fetch" | "eval" | "document";
  readonly message: string;
}

export interface PackedMod {
  readonly archive: Uint8Array;
  readonly contentHash: string;
  readonly manifest: PrismManifest;
  readonly warnings: readonly PackWarning[];
}

export interface LoadedMod {
  readonly manifest: PrismManifest;
  readonly files: Readonly<Record<string, Uint8Array>>;
}

const IGNORED_DIRECTORIES = new Set(["filters/dns", "gateway"]);
const LINT_TERMS = ["fetch", "eval", "document"] as const;

export function packMod(sourceDirectory: string, outputFile?: string): PackedMod {
  const root = resolve(sourceDirectory);
  const loaded = loadUnpackedMod(root);
  const files: Record<string, Uint8Array> = {};
  const warnings: PackWarning[] = [];

  for (const file of listFiles(root)) {
    const archivePath = normalisePath(relative(root, file));
    if (archivePath.endsWith(".ts") && archivePath.startsWith("src/")) {
      if (archivePath.endsWith(".d.ts")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      warnings.push(...lintSource(archivePath, source));
      files[archivePath.replace(/\.ts$/u, ".js")] = strToU8(
        compileTypeScript(archivePath, source),
      );
      continue;
    }
    files[archivePath] = new Uint8Array(readFileSync(file));
  }

  const archive = zipSync(files, { level: 6 });
  const contentHash = createHash("sha256").update(archive).digest("hex");
  if (outputFile !== undefined) {
    mkdirSync(dirname(outputFile), { recursive: true });
    writeFileSync(outputFile, archive);
  }

  return {
    archive,
    contentHash,
    manifest: loaded.manifest,
    warnings,
  };
}

export function loadUnpackedMod(sourceDirectory: string): LoadedMod {
  const root = resolve(sourceDirectory);
  const manifestPath = join(root, "prism.yaml");
  const source = readFileSync(manifestPath, "utf8");
  const manifest = validateManifest(source, manifestPath);
  const files: Record<string, Uint8Array> = {};

  for (const file of listFiles(root)) {
    files[normalisePath(relative(root, file))] = new Uint8Array(
      readFileSync(file),
    );
  }

  return { manifest, files };
}

export function loadPackedMod(
  archive: Uint8Array,
  archiveName = "mod.prism",
): LoadedMod {
  const files = unzipSync(archive);
  const encodedManifest = files["prism.yaml"];
  const manifestSource =
    encodedManifest === undefined ? "" : strFromU8(encodedManifest);
  const manifest = validateManifest(
    manifestSource,
    `${archiveName}/prism.yaml`,
  );
  return { manifest, files };
}

function listFiles(root: string): string[] {
  const files: string[] = [];

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const relativePath = normalisePath(relative(root, path));
      if (
        entry.isDirectory() &&
        !IGNORED_DIRECTORIES.has(relativePath)
      ) {
        visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  visit(root);
  return files.sort((left, right) =>
    normalisePath(relative(root, left)).localeCompare(
      normalisePath(relative(root, right)),
    ),
  );
}

function compileTypeScript(file: string, source: string): string {
  const result = ts.transpileModule(source, {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      verbatimModuleSyntax: true,
    },
  });
  const errors = result.diagnostics?.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors !== undefined && errors.length > 0) {
    const details = errors
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      )
      .join("\n");
    throw new Error(`Could not compile ${file}:\n${details}`);
  }
  return result.outputText;
}

function lintSource(file: string, source: string): PackWarning[] {
  const warnings: PackWarning[] = [];
  const lines = source.split(/\r?\n/u);
  for (const term of LINT_TERMS) {
    const expression = new RegExp(`\\b${term}\\b`, "u");
    const index = lines.findIndex((line) => expression.test(line));
    if (index >= 0) {
      warnings.push({
        file,
        line: index + 1,
        term,
        message: `${term} is unavailable to mod code at runtime`,
      });
    }
  }
  return warnings;
}

function normalisePath(path: string): string {
  return path.replaceAll("\\", "/");
}
