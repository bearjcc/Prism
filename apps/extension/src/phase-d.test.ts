import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import {
  loadPackedMod,
  loadUnpackedMod,
  packMod,
} from "@prism/schema";
import { describe, expect, test, vi } from "vitest";
import { activate as activateKittenMod } from "../../../mods/kitten-ad-replace/src/index.js";
import {
  activateContentMods,
  createContentHandlers,
} from "./content-script.js";
import { compileBrowserFilters } from "./dnr.js";
import { extractAdSlots } from "./extractors/ad-slot.js";
import { createPrismApi, TabUndoStack } from "./prism-api.js";
import {
  handleRuntimeMessage,
  type ServiceWorkerDependencies,
} from "./service-worker.js";

const kittenModRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "mods",
  "kitten-ad-replace",
);

describe("Phase D kitten tracer", () => {
  test("exposes ad-slot handles through the capability extractor", async () => {
    const dom = new JSDOM(`
      <div data-prism-ad-slot="banner">Advert HTML</div>
    `);
    const handlers = createContentHandlers(dom.window.document);

    await expect(
      handlers.extract?.("visual.ad-slot.replace"),
    ).resolves.toEqual([{ id: "banner" }]);
  });

  test("replaces an extracted slot with a trusted image and restores it", () => {
    const dom = new JSDOM(`
      <aside data-prism-ad-slot="sidebar">
        <a href="https://ads.example.test">Original advert</a>
      </aside>
    `);
    const document = dom.window.document;
    const [slot] = extractAdSlots(document);
    const manifest = loadUnpackedMod(kittenModRoot).manifest;
    const handlers = createContentHandlers(
      document,
      (modId, asset) =>
        `chrome-extension://prism/bundled-mods/${modId}/${asset}`,
    );
    const undo = new TabUndoStack();
    const prism = createPrismApi({
      manifest,
      grants: ["visual.ad-slot.replace"],
      tabId: 1,
      handlers,
      undo,
    });

    prism.slots.replace(slot!, {
      asset: "assets/kitten-1.svg",
      alt: "A sleeping kitten",
    });

    const replacement = document.querySelector<HTMLImageElement>(
      '[data-prism-ad-slot="sidebar"] img',
    );
    expect(replacement?.src).toBe(
      "chrome-extension://prism/bundled-mods/prism.kitten-ad-replace/assets/kitten-1.svg",
    );
    expect(replacement?.alt).toBe("A sleeping kitten");
    expect(replacement?.dataset.prismOwned).toBe("true");

    expect(() =>
      prism.slots.replace(slot!, {
        asset: "assets/not-declared.svg",
        alt: "Not declared",
      }),
    ).toThrow("is not declared");
    expect(undo.undoLast(1)).toBe(true);
    expect(
      document.querySelector('[data-prism-ad-slot="sidebar"]')?.textContent,
    ).toContain("Original advert");
  });

  test("waits for document_start slots before activating the kitten mod", async () => {
    const dom = new JSDOM("", { url: "https://example.test/page" });
    const document = dom.window.document;
    const manifest = loadUnpackedMod(kittenModRoot).manifest;
    const activate = vi.fn(activateKittenMod);
    const loadEntry = vi.fn().mockResolvedValue({ activate });
    const activation = activateContentMods({
      url: dom.window.location.href,
      requestActiveMods: vi.fn().mockResolvedValue({
        mods: [
          {
            manifest,
            entry: "bundled-mods/prism.kitten-ad-replace/src/index.js",
            grants: ["visual.ad-slot.replace"],
          },
        ],
      }),
      loadEntry,
      handlers: createContentHandlers(document),
      undo: new TabUndoStack(),
      contentDocument: document,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadEntry).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();

    const slot = document.createElement("aside");
    slot.dataset.prismAdSlot = "late-sidebar";
    slot.textContent = "Late advert";
    document.body.append(slot);

    await activation;
    expect(activate).toHaveBeenCalledOnce();
    expect(slot.querySelector("img")?.src).toContain(
      "bundled-mods/prism.kitten-ad-replace/assets/kitten-1.svg",
    );
  });

  test("activates a later native mod when the page has no ad slots", async () => {
    const dom = new JSDOM("<main></main>", { url: "https://example.test/page" });
    const kittenManifest = loadUnpackedMod(kittenModRoot).manifest;
    const siblingManifest = {
      id: "fixture.sibling",
      version: "1.0.0",
      runtime: "native" as const,
      capabilities: { required: [] },
      scopes: ["<all_urls>"],
    };
    const siblingActivate = vi.fn();
    const loadEntry = vi.fn(async (entry: string) => {
      if (entry.endsWith("sibling.js")) {
        return { activate: siblingActivate };
      }
      return { activate: activateKittenMod };
    });

    const activation = activateContentMods({
      url: dom.window.location.href,
      requestActiveMods: vi.fn().mockResolvedValue({
        mods: [
          {
            manifest: kittenManifest,
            entry: "bundled-mods/prism.kitten-ad-replace/src/index.js",
            grants: ["visual.ad-slot.replace"],
          },
          {
            manifest: siblingManifest,
            entry: "bundled-mods/fixture.sibling/src/sibling.js",
            grants: [],
          },
        ],
      }),
      loadEntry,
      handlers: createContentHandlers(dom.window.document),
      undo: new TabUndoStack(),
      contentDocument: dom.window.document,
      adSlotWaitMs: 250,
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(siblingActivate).toHaveBeenCalledOnce();

    await expect(activation).resolves.toEqual([
      { id: "prism.kitten-ad-replace", status: "active" },
      { id: "fixture.sibling", status: "active" },
    ]);
  });

  test("replaces every slot in the kitten fixture without page network access", async () => {
    const fixture = readFileSync(
      join(kittenModRoot, "fixtures", "ads.html"),
      "utf8",
    );
    const packed = packMod(kittenModRoot);
    const compiledSource = new TextDecoder().decode(
      loadPackedMod(packed.archive).files["src/index.js"] ?? new Uint8Array(),
    );
    const manifest = packed.manifest;
    const dom = new JSDOM(fixture);
    const request = vi.fn();
    const undo = new TabUndoStack();
    const prism = createPrismApi({
      manifest,
      grants: ["visual.ad-slot.replace"],
      tabId: 4,
      handlers: {
        ...createContentHandlers(dom.window.document),
        request,
      },
      undo,
    });

    await activateKittenMod(prism);

    expect(
      dom.window.document.querySelectorAll("[data-prism-ad-slot] img"),
    ).toHaveLength(2);
    expect(compiledSource).not.toMatch(/\bfetch\b/u);
    expect(packed.warnings).toEqual([]);
    expect(request).not.toHaveBeenCalled();
    expect(undo.undoLast(4)).toBe(true);
    expect(
      dom.window.document.querySelector('[data-prism-ad-slot="sidebar"]')
        ?.textContent,
    ).toContain("Sidebar advert");
  });

  test("routes granted remote kitten requests only through the broker", async () => {
    const manifest = loadUnpackedMod(kittenModRoot).manifest;
    const request = vi.fn().mockResolvedValue({
      status: 200,
      fields: { asset: "remote-kitten" },
    });
    const denied = createPrismApi({
      manifest,
      grants: ["visual.ad-slot.replace"],
      tabId: 1,
      handlers: { request },
    });
    const granted = createPrismApi({
      manifest,
      grants: ["visual.ad-slot.replace", "network.egress"],
      tabId: 1,
      handlers: { request },
    });

    await expect(denied.net.request("remote-kitten-images")).rejects.toThrow(
      "not granted capability network.egress",
    );
    expect(request).not.toHaveBeenCalled();
    await expect(
      granted.net.request("remote-kitten-images"),
    ).resolves.toEqual({
      status: 200,
      fields: { asset: "remote-kitten" },
    });
    expect(request).toHaveBeenCalledOnce();
  });

  test("routes content egress to the fail-closed service-worker broker", async () => {
    const manifest = loadUnpackedMod(kittenModRoot).manifest;
    const dependencies: ServiceWorkerDependencies = {
      getState: vi.fn().mockResolvedValue({
        enabled: {},
        grants: {
          [manifest.id]: [
            "visual.ad-slot.replace",
            "network.egress",
          ],
        },
      }),
      setState: vi.fn(),
      sendToTab: vi.fn(),
      reloadTab: vi.fn(),
      syncBrowserRules: vi.fn(),
    };
    const sendMessage = vi.fn(
      (message: Parameters<typeof handleRuntimeMessage>[0]) =>
        handleRuntimeMessage(
          message,
          1,
          Promise.resolve([{ manifest, entry: null }]),
          dependencies,
        ),
    );
    const prism = createPrismApi({
      manifest,
      grants: ["visual.ad-slot.replace", "network.egress"],
      tabId: 1,
      handlers: createContentHandlers(
        new JSDOM("").window.document,
        undefined,
        sendMessage,
      ),
    });

    await expect(
      prism.net.request("remote-kitten-images"),
    ).resolves.toEqual({
      status: 503,
      fields: { error: "Network broker unavailable" },
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: "network-request",
      modId: manifest.id,
      contractId: "remote-kitten-images",
    });
  });

  test("reloads the affected tab when a mod is disabled", async () => {
    const manifest = loadUnpackedMod(kittenModRoot).manifest;
    const reloadTab = vi.fn().mockResolvedValue(undefined);
    const syncBrowserRules = vi.fn().mockResolvedValue(undefined);
    const dependencies: ServiceWorkerDependencies = {
      getState: vi.fn().mockResolvedValue({
        enabled: { [manifest.id]: true },
        grants: {},
      }),
      setState: vi.fn().mockResolvedValue(undefined),
      sendToTab: vi.fn(),
      reloadTab,
      syncBrowserRules,
    };

    await expect(
      handleRuntimeMessage(
        {
          type: "set-enabled",
          modId: manifest.id,
          enabled: false,
          tabId: 7,
        },
        undefined,
        Promise.resolve([{ manifest, entry: null }]),
        dependencies,
      ),
    ).resolves.toEqual({ ok: true });

    expect(reloadTab).toHaveBeenCalledWith(7);
    expect(syncBrowserRules).toHaveBeenCalledOnce();
  });

  test("compiles only example third-party hosts from the kitten filter", () => {
    const filter = readFileSync(
      join(kittenModRoot, "filters", "browser", "ads.txt"),
      "utf8",
    );
    const rules = compileBrowserFilters([filter]);

    expect(rules.map((rule) => rule.condition.urlFilter)).toEqual([
      "||ads.example.test^",
      "||tracking.example.test^",
    ]);
    expect(filter).not.toContain("youtube.com");
  });
});
