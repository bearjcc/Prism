import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { loadUnpackedMod, type PrismApi } from "@prism/schema";
import { afterEach, describe, expect, test, vi } from "vitest";
import { activate as activateAgeGateMod } from "../../../mods/age-gate-auto-confirm/src/index.js";
import {
  activateContentMods,
  createContentHandlers,
} from "./content-script.js";
import { createPrismApi, TabUndoStack } from "./prism-api.js";

const modRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "mods",
  "age-gate-auto-confirm",
);

describe("Phase AA age gate tracer", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("the mod only requests site.ageGate.autoConfirm", async () => {
    const autoConfirmAgeGate = vi.fn();
    const prism: PrismApi = {
      slots: { replace: vi.fn() },
      styles: { apply: vi.fn() },
      ui: {
        allowlist: vi.fn(),
        autoConfirmAgeGate,
        dismissSubscribeModals: vi.fn(),
      },
      extract: vi.fn(),
      net: { request: vi.fn() },
    };

    await activateAgeGateMod(prism);

    expect(autoConfirmAgeGate).toHaveBeenCalledOnce();
    expect(prism.extract).not.toHaveBeenCalled();
  });

  test("integration clears a button gate and logs a mod-action event", async () => {
    const fixture = readFileSync(
      join(modRoot, "fixtures", "button-gate.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, {
      url: "https://heuristic.test/",
      runScripts: "dangerously",
    });
    const manifest = loadUnpackedMod(modRoot).manifest;
    const events: unknown[] = [];
    const prism = createPrismApi({
      manifest,
      grants: ["site.ageGate.autoConfirm"],
      tabId: 3,
      handlers: createContentHandlers(
        dom.window.document,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        (event) => {
          events.push(event);
        },
      ),
    });

    await activateAgeGateMod(prism);

    expect(dom.window.document.getElementById("gate")).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        layer: "mod-action",
        action: "ageGate.genericConfirm",
        outcome: "applied",
      }),
    );
  });

  test("activateContentMods runs the bundled age gate tracer", async () => {
    const fixture = readFileSync(
      join(modRoot, "fixtures", "button-gate.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, {
      url: "https://bundle.test/",
      runScripts: "dangerously",
    });
    const manifest = loadUnpackedMod(modRoot).manifest;
    const states = await activateContentMods({
      url: "https://bundle.test/",
      contentDocument: dom.window.document,
      handlers: createContentHandlers(dom.window.document),
      undo: new TabUndoStack(),
      requestActiveMods: async () => ({
        mods: [
          {
            manifest,
            entry: "bundled-mods/prism.age-gate-auto-confirm/src/index.js",
            grants: ["site.ageGate.autoConfirm"],
            files: loadUnpackedMod(modRoot).files,
            entrySource: readFileSync(join(modRoot, "src", "index.ts"), "utf8"),
          },
        ],
      }),
      loadEntry: async () => ({ activate: activateAgeGateMod }),
    });
    expect(states).toEqual([
      { id: "prism.age-gate-auto-confirm", status: "active" },
    ]);
    expect(dom.window.document.getElementById("gate")).toBeNull();
  });
});
