import { validateManifest } from "@prism/schema/validate";
import type { BundledMod } from "./loader.js";
import {
  decodeArchiveFromStorage,
  installedModFromPackedArchive,
} from "./packed-mod.js";

export function readCompiledPackageFromStorage(
  storageId: string,
  encoded: string,
): BundledMod {
  if (typeof encoded !== "string" || encoded === "") {
    throw new Error(`Cached package ${storageId} is empty`);
  }
  const imported = installedModFromPackedArchive(
    decodeArchiveFromStorage(encoded),
    `${storageId}.prism`,
  );
  const yamlBytes = imported.files?.["prism.yaml"];
  if (yamlBytes === undefined) {
    throw new Error(`Cached package ${storageId} is missing prism.yaml`);
  }
  const manifest = validateManifest(
    new TextDecoder().decode(yamlBytes),
    `${storageId}.prism/prism.yaml`,
  );
  if (imported.manifest.id !== storageId || manifest.id !== storageId) {
    throw new Error(
      `Stored archive id ${storageId} does not match manifest ${imported.manifest.id}`,
    );
  }
  return imported;
}

export function loadImportedModsFromStorage(
  importedArchives: Readonly<Record<string, string>> | undefined,
): BundledMod[] {
  if (importedArchives === undefined) {
    return [];
  }
  const imported: BundledMod[] = [];
  for (const [id, encoded] of Object.entries(importedArchives)) {
    try {
      imported.push(readCompiledPackageFromStorage(id, encoded));
    } catch {
      continue;
    }
  }
  return imported;
}
