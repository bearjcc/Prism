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
import { createContentHandlers } from "./content-script.js";
import { compileBrowserFilters } from "./dnr.js";
import { extractAdSlots } from "./extractors/ad-slot.js";
import { createPrismApi, TabUndoStack } from "./prism-api.js";

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
    const handlers = createContentHandlers(
      document,
      (asset) => `chrome-extension://prism/${asset}`,
    );

    const undo = handlers.replaceSlot?.(slot!, {
      asset: "bundled-mods/prism.kitten-ad-replace/assets/kitten-1.svg",
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

    expect(undo).toBeTypeOf("function");
    undo?.();
    expect(
      document.querySelector('[data-prism-ad-slot="sidebar"]')?.textContent,
    ).toContain("Original advert");
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
