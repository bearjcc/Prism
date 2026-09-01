import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import { loadNativeMods } from "./loader.js";
import {
  MOD_FAILURE_BUDGET,
  isModPausedOnOrigin,
  recordModFailure,
  recordModSuccess,
  reportModLoadOutcomes,
} from "./mod-pause.js";
import { describeModPause, mountPopup } from "./popup.js";
import { createPrismApi } from "./prism-api.js";
import {
  handleRuntimeMessage,
  selectActiveMods,
  type ServiceWorkerDependencies,
  type StoredState,
} from "./service-worker.js";
import { activateContentMods } from "./content-script.js";
import { TabUndoStack } from "./prism-api.js";

const emptyManifest = {
  id: "fixture.empty",
  version: "1.0.0",
  runtime: "native" as const,
  capabilities: { required: [] as const },
  scopes: ["https://example.com/*"],
};

const siblingManifest = {
  ...emptyManifest,
  id: "fixture.sibling",
};

const auth = {
  extensionId: "fixture-extension",
  popupUrl: "chrome-extension://fixture-extension/popup.html",
};

function storedDependencies(stored: StoredState): ServiceWorkerDependencies {
  return {
    getState: vi.fn(async () => stored),
    setState: vi.fn(async (state) => {
      Object.assign(stored, state);
    }),
    sendToTab: vi.fn(),
    reloadTab: vi.fn(),
    queryTabs: vi.fn().mockResolvedValue([]),
    syncBrowserRules: vi.fn(),
  };
}

describe("Phase T mod pause after repeated failures", () => {
  test("one throwing activate does not reject load or skip siblings", async () => {
    const siblingActivate = vi.fn();
    const pageFlag = { loaded: true };

    await expect(
      loadNativeMods(
        [
          {
            manifest: emptyManifest,
            activate: () => {
              throw new Error("broken activate");
            },
          },
          {
            manifest: siblingManifest,
            activate: siblingActivate,
          },
        ],
        {
          url: "https://example.com/page",
          tabId: 1,
          grantsByMod: {},
          handlers: {},
        },
      ),
    ).resolves.toEqual([
      { id: "fixture.empty", status: "failed" },
      { id: "fixture.sibling", status: "active" },
    ]);
    expect(siblingActivate).toHaveBeenCalledOnce();
    expect(pageFlag.loaded).toBe(true);
  });

  test("one throwing load does not reject load or skip siblings", async () => {
    const siblingActivate = vi.fn();

    await expect(
      loadNativeMods(
        [
          {
            manifest: emptyManifest,
            load: async () => {
              throw new Error("broken load");
            },
          },
          {
            manifest: siblingManifest,
            activate: siblingActivate,
          },
        ],
        {
          url: "https://example.com/page",
          tabId: 1,
          grantsByMod: {},
          handlers: {},
        },
      ),
    ).resolves.toEqual([
      { id: "fixture.empty", status: "failed" },
      { id: "fixture.sibling", status: "active" },
    ]);
    expect(siblingActivate).toHaveBeenCalledOnce();
  });

  test("a throwing outcome reporter does not break page load or sibling mods", async () => {
    const siblingActivate = vi.fn();
    const states = await activateContentMods({
      url: "https://example.com/page",
      requestActiveMods: async () => ({
        mods: [
          { manifest: emptyManifest, entry: "broken.js", grants: [] },
          { manifest: siblingManifest, entry: "ok.js", grants: [] },
        ],
      }),
      loadEntry: async (entry) => {
        if (entry === "broken.js") {
          return {
            activate: () => {
              throw new Error("broken activate");
            },
          };
        }
        return { activate: siblingActivate };
      },
      handlers: {},
      undo: new TabUndoStack(),
      reportLoadOutcomes: async () => {
        throw new Error("reporter failed");
      },
    });

    expect(states).toEqual([
      { id: "fixture.empty", status: "failed" },
      { id: "fixture.sibling", status: "active" },
    ]);
    expect(siblingActivate).toHaveBeenCalledOnce();
  });

  test(`pauses a mod on an origin after ${MOD_FAILURE_BUDGET} consecutive failures`, () => {
    expect(MOD_FAILURE_BUDGET).toBe(3);
    let budget = recordModFailure(undefined, "fixture.empty", "https://example.com");
    budget = recordModFailure(budget, "fixture.empty", "https://example.com");
    expect(
      isModPausedOnOrigin(budget, "fixture.empty", "https://example.com"),
    ).toBe(false);
    budget = recordModFailure(budget, "fixture.empty", "https://example.com");
    expect(
      isModPausedOnOrigin(budget, "fixture.empty", "https://example.com"),
    ).toBe(true);
  });

  test("a success before the threshold resets the budget", () => {
    let budget = recordModFailure(undefined, "fixture.empty", "https://example.com");
    budget = recordModFailure(budget, "fixture.empty", "https://example.com");
    budget = recordModSuccess(budget, "fixture.empty", "https://example.com");
    budget = recordModFailure(budget, "fixture.empty", "https://example.com");
    expect(
      isModPausedOnOrigin(budget, "fixture.empty", "https://example.com"),
    ).toBe(false);
  });

  test("pause is per mod and per origin; siblings and other origins stay active", async () => {
    const stored: StoredState = { enabled: {}, grants: {} };
    const dependencies = storedDependencies(stored);
    const mods = Promise.resolve([
      { manifest: emptyManifest, entry: "a.js" },
      { manifest: siblingManifest, entry: "b.js" },
    ]);

    for (let i = 0; i < MOD_FAILURE_BUDGET; i += 1) {
      await expect(
        handleRuntimeMessage(
          {
            type: "record-mod-failure",
            modId: "fixture.empty",
            origin: "https://example.com",
          },
          { id: "fixture-extension" },
          mods,
          dependencies,
          auth,
        ),
      ).resolves.toEqual({
        ok: true,
        paused: i + 1 >= MOD_FAILURE_BUDGET,
      });
    }

    expect(
      stored.modFailureBudget?.["fixture.empty"]?.["https://example.com"]?.paused,
    ).toBe(true);

    expect(
      selectActiveMods(
        [
          { manifest: emptyManifest, entry: "a.js" },
          { manifest: siblingManifest, entry: "b.js" },
        ],
        "https://example.com/page",
        {},
        {},
        {},
        { "fixture.empty": ["https://example.com"] },
      ).mods.map((mod) => mod.manifest.id),
    ).toEqual(["fixture.sibling"]);

    expect(
      selectActiveMods(
        [
          { manifest: { ...emptyManifest, scopes: ["https://other.example/*"] }, entry: "a.js" },
          { manifest: siblingManifest, entry: "b.js" },
        ],
        "https://other.example/page",
        {},
        {},
        {},
        { "fixture.empty": ["https://example.com"] },
      ).mods.map((mod) => mod.manifest.id),
    ).toEqual(["fixture.empty"]);
  });

  test("popup lists paused on the affected origin and shows the pause copy", async () => {
    const stored: StoredState = { enabled: {}, grants: {} };
    const dependencies = storedDependencies(stored);
    const mods = Promise.resolve([{ manifest: emptyManifest, entry: null }]);

    for (let i = 0; i < MOD_FAILURE_BUDGET; i += 1) {
      await handleRuntimeMessage(
        {
          type: "record-mod-failure",
          modId: "fixture.empty",
          origin: "https://example.com",
        },
        { id: "fixture-extension" },
        mods,
        dependencies,
        auth,
      );
    }

    await expect(
      handleRuntimeMessage(
        { type: "list-mods", url: "https://example.com/page" },
        { id: "fixture-extension" },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        manifest: emptyManifest,
        pausedOnOrigin: true,
      }),
    ]);
    await expect(
      handleRuntimeMessage(
        { type: "list-mods", url: "https://other.example/page" },
        { id: "fixture-extension" },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        pausedOnOrigin: false,
      }),
    ]);

    const sendMessage = vi.fn(async (message: { readonly type?: string }) => {
      if (message.type === "list-activity") {
        return [];
      }
      if (
        message.type === "get-behaviour-policies" ||
        message.type === "get-paste-policy"
      ) {
        const policy = {
          default: true,
          denyOrigins: [],
          allow: true,
          originDenied: false,
        };
        return {
          paste: policy,
          "popup-suppress": policy,
          "title-freeze": policy,
          "scroll-lock": policy,
          "overlay-suppress": policy,
          "consent-reject": policy,
          autoplay: policy,
        };
      }
      return [
        {
          manifest: emptyManifest,
          enabled: true,
          grants: [],
          pausedOnOrigin: true,
        },
      ];
    });
    const dom = new JSDOM(`<!doctype html><p id="page-origin"></p>
      <ol id="page-activity"></ol>
      <section id="global-policies"></section>
      <main id="mods"></main>
      <ol id="activity"></ol>
      <input id="import-mod" type="file">
      <button id="undo" type="button"></button>`, {
      url: "chrome-extension://fixture-extension/popup.html",
    });
    await mountPopup(
      {
        runtime: { sendMessage },
        permissions: {
          request: async () => true,
          remove: async () => true,
        },
        tabs: {
          query: async () => [{ id: 1, url: "https://example.com/page" }],
        },
      },
      dom.window.document,
    );

    expect(dom.window.document.querySelector(".mod-paused")?.textContent).toBe(
      describeModPause(),
    );
    expect(describeModPause()).toBe("Paused on this site after repeated failures.");
    expect(
      [...dom.window.document.querySelectorAll("label span")].some(
        (node) => node.textContent === "Resume on this site",
      ),
    ).toBe(true);
  });

  test("paused mods are skipped by the loader without running activate", async () => {
    const activate = vi.fn();
    await expect(
      loadNativeMods([{ manifest: emptyManifest, activate }], {
        url: "https://example.com/page",
        tabId: 1,
        grantsByMod: {},
        pausedByMod: { "fixture.empty": true },
        handlers: {},
      }),
    ).resolves.toEqual([{ id: "fixture.empty", status: "paused" }]);
    expect(activate).not.toHaveBeenCalled();
  });

  test("pause and unpause cannot grant eval, page fetch, or extractor HTML", async () => {
    const stored: StoredState = {
      enabled: {},
      grants: { "fixture.empty": ["visual.hide"] },
    };
    const dependencies = storedDependencies(stored);
    const hideManifest = {
      ...emptyManifest,
      capabilities: { required: ["visual.hide" as const] },
    };
    const mods = Promise.resolve([{ manifest: hideManifest, entry: null }]);

    await handleRuntimeMessage(
      {
        type: "set-mod-pause",
        modId: "fixture.empty",
        origin: "https://example.com",
        paused: true,
      },
      { id: "fixture-extension", url: auth.popupUrl },
      mods,
      dependencies,
      auth,
    );
    expect(stored.grants).toEqual({ "fixture.empty": ["visual.hide"] });

    await handleRuntimeMessage(
      {
        type: "set-mod-pause",
        modId: "fixture.empty",
        origin: "https://example.com",
        paused: false,
      },
      { id: "fixture-extension", url: auth.popupUrl },
      mods,
      dependencies,
      auth,
    );
    expect(stored.grants).toEqual({ "fixture.empty": ["visual.hide"] });

    const extract = vi.fn(async () => ({ html: "<div></div>" }));
    const request = vi.fn(async () => ({
      ok: true as const,
      body: "fetched",
    }));
    const prism = createPrismApi({
      manifest: hideManifest,
      grants: stored.grants?.["fixture.empty"] ?? [],
      tabId: 1,
      handlers: { extract, request },
    });

    await expect(prism.extract("youtube.watch.videoId")).resolves.toBeUndefined();
    await expect(prism.net.request("reddit.comments")).resolves.toEqual({
      status: 0,
      fields: {},
    });
    expect(extract).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(prism).not.toHaveProperty("document");
    expect(prism).not.toHaveProperty("eval");
    expect(prism).not.toHaveProperty("fetch");
  });

  test("outcome reporting sends failure then success without throwing", async () => {
    const send = vi.fn(async () => {
      throw new Error("offline");
    });
    await expect(
      reportModLoadOutcomes(
        [
          { id: "fixture.empty", status: "failed" },
          { id: "fixture.sibling", status: "active" },
        ],
        "https://example.com/page",
        send,
      ),
    ).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith({
      type: "record-mod-failure",
      modId: "fixture.empty",
      origin: "https://example.com",
    });
    expect(send).toHaveBeenCalledWith({
      type: "record-mod-success",
      modId: "fixture.sibling",
      origin: "https://example.com",
    });
  });
});
