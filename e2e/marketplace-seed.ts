import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadPackedMod } from "@prism/schema/archive";
import type { ExtensionSession } from "./extension-session.js";

function encodeArchiveForStorage(archive: Uint8Array): string {
  return Buffer.from(archive).toString("base64");
}

export async function seedMarketplaceMods(
  session: ExtensionSession & {
    serviceWorker?: { evaluate: (...args: unknown[]) => Promise<unknown> };
  },
  packagesRoot: string,
): Promise<void> {
  const importedArchives: Record<string, string> = {};
  const enabled: Record<string, boolean> = {};
  for (const name of readdirSync(packagesRoot).filter((entry) => entry.endsWith(".prism"))) {
    const archive = new Uint8Array(readFileSync(join(packagesRoot, name)));
    const loaded = loadPackedMod(archive, name);
    importedArchives[loaded.manifest.id] = encodeArchiveForStorage(archive);
    enabled[loaded.manifest.id] = true;
  }
  const worker = session.serviceWorker;
  if (worker === undefined) {
    return;
  }
  await worker.evaluate(
    async (payload: {
      importedArchives: Record<string, string>;
      enabled: Record<string, boolean>;
    }) => {
      await chrome.storage.local.set({
        importedArchives: payload.importedArchives,
        enabled: payload.enabled,
      });
    },
    { importedArchives, enabled },
  );
}
