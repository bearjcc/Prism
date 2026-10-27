import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { loadUnpackedMod, type PrismApi } from "@prism/schema";
import { describe, expect, test, vi } from "vitest";
import { activate as activateSubscribeMod } from "../../../mods/subscribe-modal-dismiss/src/index.js";
import { createContentHandlers } from "./content-script.js";
import { createPrismApi } from "./prism-api.js";

const modRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "mods",
  "subscribe-modal-dismiss",
);

describe("Phase AB subscribe modal tracer", () => {
  test("the mod only requests site.subscribe.dismiss", async () => {
    const dismissSubscribeModals = vi.fn();
    const prism: PrismApi = {
      slots: { replace: vi.fn() },
      styles: { apply: vi.fn() },
      ui: {
        allowlist: vi.fn(),
        autoConfirmAgeGate: vi.fn(),
        dismissSubscribeModals,
      },
      extract: vi.fn(),
      net: { request: vi.fn() },
    };

    await activateSubscribeMod(prism);

    expect(dismissSubscribeModals).toHaveBeenCalledOnce();
  });

  test("integration dismisses a Substack-shaped popup", async () => {
    const fixture = readFileSync(
      join(modRoot, "fixtures", "substack-subscribe.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, {
      url: "https://newsletter.substack.com/p/post",
      runScripts: "dangerously",
    });
    const manifest = loadUnpackedMod(modRoot).manifest;
    const events: unknown[] = [];
    const prism = createPrismApi({
      manifest,
      grants: ["site.subscribe.dismiss"],
      tabId: 5,
      handlers: createContentHandlers(
        dom.window.document,
        undefined,
        undefined,
        undefined,
        undefined,
        (event) => {
          events.push(event);
        },
      ),
    });

    await activateSubscribeMod(prism);

    expect(dom.window.document.getElementById("subscribe-popup")).toBeNull();
    expect(events).toContainEqual(
      expect.objectContaining({
        layer: "mod-action",
        action: "subscribe.heuristicDismiss",
        outcome: "applied",
      }),
    );
  });
});
