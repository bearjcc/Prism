import { loadPackedMod } from "@prism/schema/archive";
import { stylesFromModFiles, type BundledMod } from "./loader.js";

export function encodeArchiveForStorage(archive: Uint8Array): string {
  let binary = "";
  for (const byte of archive) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function decodeArchiveFromStorage(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function installedModFromPackedArchive(
  archive: Uint8Array,
  archiveName = "mod.prism",
): BundledMod {
  const loaded = loadPackedMod(archive, archiveName);
  const entryBytes = loaded.files["src/index.js"];
  const assetUrls: Record<string, string> = {};
  for (const asset of loaded.manifest.assets ?? []) {
    const bytes = loaded.files[asset];
    if (bytes !== undefined) {
      assetUrls[asset] = bytesToDataUrl(asset, bytes);
    }
  }
  return {
    origin: "imported",
    manifest: loaded.manifest,
    entry:
      entryBytes === undefined
        ? null
        : `imported/${loaded.manifest.id}/src/index.js`,
    entrySource:
      entryBytes === undefined
        ? undefined
        : new TextDecoder().decode(entryBytes),
    assetUrls,
    files: loaded.files,
    styles: stylesFromModFiles(loaded.files),
  };
}

export function mergeInstalledMods(
  bundled: readonly BundledMod[],
  imported: readonly BundledMod[],
): BundledMod[] {
  const ids = new Set(bundled.map((mod) => mod.manifest.id));
  const merged = bundled.map((mod) => ({
    ...mod,
    origin: mod.origin ?? "bundled",
  }));
  for (const mod of imported) {
    if (ids.has(mod.manifest.id)) {
      throw new Error(
        `Imported mod id ${mod.manifest.id} conflicts with bundled mod`,
      );
    }
    ids.add(mod.manifest.id);
    merged.push({ ...mod, origin: "imported" });
  }
  return merged;
}

function bytesToDataUrl(path: string, bytes: Uint8Array): string {
  return `data:${mimeForArchivePath(path)};base64,${encodeArchiveForStorage(bytes)}`;
}

function mimeForArchivePath(path: string): string {
  if (path.endsWith(".svg")) {
    return "image/svg+xml";
  }
  if (path.endsWith(".png")) {
    return "image/png";
  }
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (path.endsWith(".gif")) {
    return "image/gif";
  }
  if (path.endsWith(".webp")) {
    return "image/webp";
  }
  if (path.endsWith(".txt")) {
    return "text/plain";
  }
  return "application/octet-stream";
}
