import { strToU8, unzipSync, zipSync } from "fflate";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { packMod } from "@prism/schema";
import { describe, expect, test, vi } from "vitest";
import {
  loadImportedModsFromStorage,
  readCompiledPackageFromStorage,
} from "./compiled-package-cache.js";
import { loadNativeMods } from "./loader.js";
import { encodeArchiveForStorage, mergeInstalledMods } from "./packed-mod.js";
import {
  handleRuntimeMessage,
  type ServiceWorkerDependencies,
  type StoredState,
} from "./service-worker.js";

const goldenDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "packages",
  "schema",
  "test",
  "fixtures",
  "golden",
);

const bundled = {
  origin: "bundled" as const,
  manifest: {
    id: "fixture.empty",
    version: "1.0.0",
    runtime: "native" as const,
    capabilities: { required: [] as const },
    scopes: ["https://example.com/*"],
  },
  entry: null,
};

function packedGolden(): Uint8Array {
  return packMod(goldenDir).archive;
}

function mutateYaml(
  archive: Uint8Array,
  rewrite: (yaml: string) => string,
): Uint8Array {
  const files = unzipSync(archive);
  const yaml = files["prism.yaml"];
  if (yaml === undefined) {
    throw new Error("fixture archive is missing prism.yaml");
  }
  return zipSync({
    ...files,
    "prism.yaml": strToU8(rewrite(new TextDecoder().decode(yaml))),
  });
}

function storeArchive(archive: Uint8Array): string {
  return encodeArchiveForStorage(archive);
}

describe("Phase X compiled package cache validate on read", () => {
  test("a valid cached archive loads and can activate", async () => {
    const encoded = storeArchive(packedGolden());
    const imported = readCompiledPackageFromStorage("golden.mod", encoded);

    expect(imported.origin).toBe("imported");
    expect(imported.manifest.id).toBe("golden.mod");
    expect(loadImportedModsFromStorage({ "golden.mod": encoded })).toEqual([
      imported,
    ]);

    const activate = vi.fn();
    const states = await loadNativeMods(
      [
        {
          manifest: imported.manifest,
          activate,
        },
      ],
      {
        url: "https://www.example.com/page",
        tabId: 1,
        grantsByMod: {
          "golden.mod": ["visual.ad-slot.replace", "network.egress"],
        },
        handlers: {},
      },
    );
    expect(states).toEqual([{ id: "golden.mod", status: "active" }]);
    expect(activate).toHaveBeenCalledOnce();
  });

  test("mutated yaml in cache is refused and not activated", async () => {
    const encoded = storeArchive(
      mutateYaml(packedGolden(), () => "id: not-valid\n"),
    );

    expect(() =>
      readCompiledPackageFromStorage("golden.mod", encoded),
    ).toThrow();
    expect(loadImportedModsFromStorage({ "golden.mod": encoded })).toEqual([]);

    const activate = vi.fn();
    const states = await loadNativeMods(
      loadImportedModsFromStorage({ "golden.mod": encoded }).map((mod) => ({
        manifest: mod.manifest,
        activate,
      })),
      {
        url: "https://www.example.com/page",
        tabId: 1,
        grantsByMod: { "golden.mod": ["visual.ad-slot.replace"] },
        handlers: {},
      },
    );
    expect(states).toEqual([]);
    expect(activate).not.toHaveBeenCalled();
  });

  test("mutated id in cache is refused and not activated", () => {
    const encoded = storeArchive(
      mutateYaml(packedGolden(), (yaml) =>
        yaml.replace("id: golden.mod", "id: tampered.mod"),
      ),
    );

    expect(() =>
      readCompiledPackageFromStorage("golden.mod", encoded),
    ).toThrow(/does not match manifest/u);
    expect(loadImportedModsFromStorage({ "golden.mod": encoded })).toEqual([]);
  });

  test("mutated capabilities in cache are refused and not activated", () => {
    const encoded = storeArchive(
      mutateYaml(packedGolden(), (yaml) =>
        yaml.replace("visual.ad-slot.replace", "eval"),
      ),
    );

    expect(() =>
      readCompiledPackageFromStorage("golden.mod", encoded),
    ).toThrow(/Unknown capability/u);
    expect(loadImportedModsFromStorage({ "golden.mod": encoded })).toEqual([]);
  });

  test("a tampered record does not block bundled mods or a good cache neighbour", async () => {
    const good = storeArchive(packedGolden());
    const brokenYaml = storeArchive(
      mutateYaml(packedGolden(), () => "not: a mapping that validates\n"),
    );
    const stored: StoredState = {
      importedArchives: {
        "golden.mod": good,
        "broken.mod": brokenYaml,
      },
    };
    const dependencies: ServiceWorkerDependencies = {
      getState: vi.fn(async () => stored),
      setState: vi.fn(async (state) => {
        Object.assign(stored, state);
      }),
      sendToTab: vi.fn(),
      reloadTab: vi.fn(),
      queryTabs: vi.fn().mockResolvedValue([]),
      syncBrowserRules: vi.fn(),
    };
    const auth = {
      extensionId: "fixture-extension",
      popupUrl: "chrome-extension://fixture-extension/popup.html",
    };

    const listed = await handleRuntimeMessage(
      { type: "list-mods" },
      { id: "fixture-extension" },
      Promise.resolve([bundled]),
      dependencies,
      auth,
    );

    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          manifest: expect.objectContaining({ id: "fixture.empty" }),
          origin: "bundled",
        }),
        expect.objectContaining({
          manifest: expect.objectContaining({ id: "golden.mod" }),
          origin: "imported",
        }),
      ]),
    );
    expect(listed).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          manifest: expect.objectContaining({ id: "broken.mod" }),
        }),
      ]),
    );

    const merged = mergeInstalledMods(
      [bundled],
      loadImportedModsFromStorage(stored.importedArchives),
    );
    expect(merged.map((mod) => mod.manifest.id)).toEqual([
      "fixture.empty",
      "golden.mod",
    ]);
  });
});
