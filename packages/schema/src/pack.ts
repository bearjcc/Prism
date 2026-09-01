import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { strToU8, zipSync } from "fflate";
import * as ts from "typescript";
import {
  normaliseArchivePath,
  type LoadedMod,
} from "./archive.js";
import { isStyleSourcePath, sanitiseCss } from "./css.js";
import {
  inspectPackage,
  type PackageFinding,
} from "./inspect-package.js";
import type { PrismManifest } from "./manifest.js";
import { validateManifest } from "./validate.js";

export { loadPackedMod } from "./archive.js";
export type { LoadedMod } from "./archive.js";

export interface PackedMod {
  readonly archive: Uint8Array;
  readonly contentHash: string;
  readonly manifest: PrismManifest;
  readonly warnings: readonly PackageFinding[];
}

export class PackagePolicyError extends Error {
  readonly findings: readonly PackageFinding[];

  constructor(findings: readonly PackageFinding[]) {
    super(
      findings
        .map(
          (finding) =>
            `${finding.file}:${finding.line} ${finding.message}`,
        )
        .join("\n"),
    );
    this.name = "PackagePolicyError";
    this.findings = findings;
  }
}

export function packMod(sourceDirectory: string, outputFile?: string): PackedMod {
  const root = resolve(sourceDirectory);
  const loaded = loadUnpackedMod(root);
  const files: Record<string, Uint8Array> = {};
  const sourceFiles: Record<string, Uint8Array> = {};

  for (const file of listFiles(root)) {
    const archivePath = normaliseArchivePath(relative(root, file));
    if (archivePath.endsWith(".ts") && archivePath.startsWith("src/")) {
      if (archivePath.endsWith(".d.ts")) {
        continue;
      }
      const source = readFileSync(file, "utf8");
      sourceFiles[archivePath] = strToU8(source);
      files[archivePath.replace(/\.ts$/u, ".js")] = strToU8(
        compileTypeScript(archivePath, source),
      );
      continue;
    }
    if (isStyleSourcePath(archivePath)) {
      sanitiseCss(readFileSync(file, "utf8"));
    }
    files[archivePath] = new Uint8Array(readFileSync(file));
  }
  const inspection = inspectPackage(loaded.manifest, {
    ...files,
    ...sourceFiles,
  });
  if (!inspection.ok) {
    throw new PackagePolicyError(inspection.findings);
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
    warnings: [],
  };
}

export function loadUnpackedMod(sourceDirectory: string): LoadedMod {
  const root = resolve(sourceDirectory);
  const manifestPath = join(root, "prism.yaml");
  const source = readFileSync(manifestPath, "utf8");
  const manifest = validateManifest(source, manifestPath);
  const files: Record<string, Uint8Array> = {};

  for (const file of listFiles(root)) {
    files[normaliseArchivePath(relative(root, file))] = new Uint8Array(
      readFileSync(file),
    );
  }

  return { manifest, files };
}

function listFiles(root: string): string[] {
  const files: string[] = [];

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  visit(root);
  return files.sort((left, right) =>
    normaliseArchivePath(relative(root, left)).localeCompare(
      normaliseArchivePath(relative(root, right)),
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


