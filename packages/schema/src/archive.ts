import { strFromU8, unzipSync } from "fflate";
import { inspectPackage } from "./inspect-package.js";
import type { PrismManifest } from "./manifest.js";
import { validateManifest } from "./validate.js";

export interface LoadedMod {
  readonly manifest: PrismManifest;
  readonly files: Readonly<Record<string, Uint8Array>>;
}

const UNSUPPORTED_DIRECTORIES = new Set(["filters/dns", "gateway"]);

export function loadPackedMod(
  archive: Uint8Array,
  archiveName = "mod.prism",
): LoadedMod {
  const files: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(unzipSync(archive))) {
    const archivePath = normaliseArchivePath(path);
    if (isUnsupportedArchivePath(archivePath)) {
      throw new Error(`Archive path ${archivePath} is not supported`);
    }
    files[archivePath] = content;
  }
  const encodedManifest = files["prism.yaml"];
  const manifestSource =
    encodedManifest === undefined ? "" : strFromU8(encodedManifest);
  const manifest = validateManifest(
    manifestSource,
    `${archiveName}/prism.yaml`,
  );
  const inspection = inspectPackage(manifest, files);
  if (!inspection.ok) {
    throw new Error(
      inspection.findings
        .map(
          (finding) =>
            `${finding.file}:${finding.line} ${finding.message}`,
        )
        .join("\n"),
    );
  }
  return { manifest, files };
}

export function isUnsupportedArchivePath(relativePath: string): boolean {
  for (const unsupported of UNSUPPORTED_DIRECTORIES) {
    if (
      relativePath === unsupported ||
      relativePath.startsWith(`${unsupported}/`)
    ) {
      return true;
    }
  }
  return false;
}

export function normaliseArchivePath(path: string): string {
  return path.replaceAll("\\", "/");
}
