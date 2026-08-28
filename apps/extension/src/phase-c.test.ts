import { describe, expect, test, vi } from "vitest";
import type { PrismManifest } from "@prism/schema";
import { sanitiseCss } from "./css.js";
import {
  loadNativeMods,
  matchesAnyScope,
  parseBundledMods,
} from "./loader.js";
import {
  activateContentMods,
  handleContentMessage,
} from "./content-script.js";
import { createPrismApi, TabUndoStack } from "./prism-api.js";
import {
  forwardUndoToTab,
  handleRuntimeMessage,
  loadBundledModIndex,
  selectActiveMods,
  type ServiceWorkerDependencies,
  updateOptionalGrant,
} from "./service-worker.js";

const emptyManifest: PrismManifest = {
  id: "fixture.empty",
  version: "1.0.0",
  runtime: "native",
  capabilities: { required: [] },
  scopes: ["https://example.com/*"],
};

const hideManifest: PrismManifest = {
  id: "fixture.hide",
  version: "1.0.0",
  runtime: "native",
  capabilities: { required: ["visual.hide"] },
  scopes: ["https://example.com/*"],
};

describe("Phase C extension runtime", () => {
  test("loads an empty native mod without doing work", async () => {
    const extract = vi.fn();

    const states = await loadNativeMods(
      [{ manifest: emptyManifest }],
      {
        url: "https://example.com/page",
        tabId: 1,
        grantsByMod: {},
        handlers: { extract },
      },
    );

    expect(states).toEqual([{ id: "fixture.empty", status: "active" }]);
    expect(extract).not.toHaveBeenCalled();
  });

  test("does not activate a mod outside its declared scopes", async () => {
    const activate = vi.fn();

    const states = await loadNativeMods(
      [{ manifest: hideManifest, activate }],
      {
        url: "https://unrelated.example/page",
        tabId: 1,
        grantsByMod: { "fixture.hide": ["visual.hide"] },
        handlers: {},
      },
    );

    expect(states).toEqual([{ id: "fixture.hide", status: "out-of-scope" }]);
    expect(activate).not.toHaveBeenCalled();
  });

  test("does not activate a mod missing a required capability grant", async () => {
    const activate = vi.fn();

    const states = await loadNativeMods(
      [{ manifest: hideManifest, activate }],
      {
        url: "https://example.com/page",
        tabId: 1,
        grantsByMod: { "fixture.hide": [] },
        handlers: {},
      },
    );

    expect(states).toEqual([
      { id: "fixture.hide", status: "missing-required-capability" },
    ]);
    expect(activate).not.toHaveBeenCalled();
  });

  test("continues activating sibling mods after one mod fails", async () => {
    const siblingActivate = vi.fn();

    await expect(
      loadNativeMods(
        [
          {
            manifest: emptyManifest,
            activate: () => {
              throw new Error("broken mod");
            },
          },
          {
            manifest: { ...emptyManifest, id: "fixture.sibling" },
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

  test("reports each active mod without waiting for slower siblings", async () => {
    let releaseSlowMod: (() => void) | undefined;
    const slowMod = new Promise<void>((resolve) => {
      releaseSlowMod = resolve;
    });
    const onStateChange = vi.fn();
    const loading = loadNativeMods(
      [
        { manifest: emptyManifest, activate: () => slowMod },
        { manifest: { ...emptyManifest, id: "fixture.sibling" } },
      ],
      {
        url: "https://example.com/page",
        tabId: 1,
        grantsByMod: {},
        handlers: {},
        onStateChange,
      },
    );

    await vi.waitFor(() => {
      expect(onStateChange).toHaveBeenCalledWith({
        id: "fixture.sibling",
        status: "active",
      });
    });
    expect(onStateChange).not.toHaveBeenCalledWith({
      id: "fixture.empty",
      status: "active",
    });

    releaseSlowMod?.();
    await loading;
  });

  test("content message path loads, activates, and undoes a bundled mod", async () => {
    const undo = new TabUndoStack();
    const reverted = vi.fn();
    const activate = vi.fn((prism) => {
      prism.styles.apply(".advert { display: none; }");
    });
    const loadEntry = vi.fn().mockResolvedValue({ activate });
    const requestActiveMods = vi.fn().mockResolvedValue({
      mods: [
        {
          manifest: hideManifest,
          entry: "bundled-mods/fixture.hide/src/index.js",
          grants: ["visual.hide"],
        },
      ],
    });

    await expect(
      activateContentMods({
        url: "https://example.com/page",
        requestActiveMods,
        loadEntry,
        handlers: { applyCss: () => reverted },
        undo,
      }),
    ).resolves.toEqual([{ id: "fixture.hide", status: "active" }]);

    expect(requestActiveMods).toHaveBeenCalledWith("https://example.com/page");
    expect(loadEntry).toHaveBeenCalledWith(
      "bundled-mods/fixture.hide/src/index.js",
    );
    expect(activate).toHaveBeenCalledOnce();
    expect(handleContentMessage({ type: "undo-last" }, undo)).toEqual({
      undone: true,
    });
    expect(reverted).toHaveBeenCalledOnce();
  });

  test("service worker forwards undo to the requested tab", async () => {
    const sendToTab = vi.fn().mockResolvedValue({ undone: true });

    await expect(forwardUndoToTab(sendToTab, 7)).resolves.toEqual({
      undone: true,
    });
    expect(sendToTab).toHaveBeenCalledWith(7, { type: "undo-last" });
  });

  test("content script reports whether a mod is active in its tab", () => {
    const activeModIds = new Set(["fixture.hide"]);

    expect(
      handleContentMessage(
        { type: "is-mod-active", modId: "fixture.hide" },
        new TabUndoStack(),
        activeModIds,
      ),
    ).toEqual({ active: true });
    expect(
      handleContentMessage(
        { type: "is-mod-active", modId: "fixture.other" },
        new TabUndoStack(),
        activeModIds,
      ),
    ).toEqual({ active: false });
  });

  test("matches package scopes independently of all_urls injection", () => {
    expect(
      matchesAnyScope(["https://*.example.com/*"], "https://www.example.com/a"),
    ).toBe(true);
    expect(
      matchesAnyScope(["https://*.example.com/*"], "https://example.net/a"),
    ).toBe(false);
  });

  test("Home scope matches query strings but not /watch", () => {
    const home = ["https://www.youtube.com/"];
    expect(matchesAnyScope(home, "https://www.youtube.com/")).toBe(true);
    expect(matchesAnyScope(home, "https://www.youtube.com/?app=desktop")).toBe(
      true,
    );
    expect(matchesAnyScope(home, "https://www.youtube.com/watch?v=abc")).toBe(
      false,
    );
  });

  test("a hide-only mod cannot extract Reddit comments", async () => {
    const prism = createPrismApi({
      manifest: hideManifest,
      grants: ["visual.hide"],
      tabId: 1,
      handlers: { extract: vi.fn() },
    });

    await expect(prism.extract("reddit.comments.search")).rejects.toThrow(
      "not granted capability reddit.comments.search",
    );
  });

  test("one mod cannot use another mod's capability grant", async () => {
    const extract = vi.fn().mockResolvedValue({ comments: [] });
    const modA = createPrismApi({
      manifest: hideManifest,
      grants: ["visual.hide"],
      tabId: 1,
      handlers: { extract },
    });
    const modBManifest: PrismManifest = {
      ...hideManifest,
      id: "fixture.reddit",
      capabilities: { required: ["reddit.comments.search"] },
    };
    const modB = createPrismApi({
      manifest: modBManifest,
      grants: ["reddit.comments.search"],
      tabId: 1,
      handlers: { extract },
    });

    await expect(modA.extract("reddit.comments.search")).rejects.toThrow();
    await expect(modB.extract("reddit.comments.search")).resolves.toEqual({
      comments: [],
    });
    expect(extract).toHaveBeenCalledTimes(1);
  });

  test("undoes only the latest visual change in the requested tab", () => {
    const undo = new TabUndoStack();
    const calls: string[] = [];
    undo.push(7, () => calls.push("tab-7-first"));
    undo.push(8, () => calls.push("tab-8"));
    undo.push(7, () => calls.push("tab-7-last"));

    expect(undo.undoLast(7)).toBe(true);
    expect(calls).toEqual(["tab-7-last"]);
    expect(undo.undoLast(8)).toBe(true);
    expect(calls).toEqual(["tab-7-last", "tab-8"]);
    expect(undo.undoLast(8)).toBe(false);
  });

  test("records reversible Prism visual operations per tab", () => {
    const undo = new TabUndoStack();
    const reverted = vi.fn();
    const prism = createPrismApi({
      manifest: hideManifest,
      grants: ["visual.hide"],
      tabId: 4,
      undo,
      handlers: { applyCss: () => reverted },
    });

    prism.styles.apply(".advert { display: none; }");

    expect(undo.undoLast(4)).toBe(true);
    expect(reverted).toHaveBeenCalledOnce();
  });

  test("rejects CSS with remote or import sources", () => {
    expect(() => sanitiseCss("a { background: url(https://x.test/a); }")).toThrow(
      "url(",
    );
    expect(() => sanitiseCss('@import "https://x.test/a.css";')).toThrow(
      "@import",
    );
    expect(() => sanitiseCss("/* @updateURL https://x.test/a */")).toThrow(
      "update URL",
    );
    expect(() =>
      sanitiseCss("a { background: u\\72l(https://x.test/a); }"),
    ).toThrow("url(");
    expect(() =>
      sanitiseCss("a { background: u\\\nrl(https://x.test/a); }"),
    ).toThrow("url(");
    expect(() =>
      sanitiseCss('@\\69mport "https://x.test/a.css";'),
    ).toThrow("@import");
    expect(sanitiseCss(".advert { display: none; }")).toBe(
      ".advert { display: none; }",
    );
  });

  test("validates a generated bundled mod index", () => {
    const mods = parseBundledMods(
      JSON.stringify([
        {
          manifest: emptyManifest,
          entry: null,
        },
      ]),
    );

    expect(mods).toEqual([{ manifest: emptyManifest, entry: null }]);
  });

  test("rejects duplicate ids in the bundled mod index", () => {
    const source = JSON.stringify([
      { manifest: emptyManifest, entry: null },
      { manifest: emptyManifest, entry: null },
    ]);

    expect(() => parseBundledMods(source)).toThrow("Duplicate bundled mod id");
  });

  test("service worker loads the generated bundled mod index", async () => {
    const fetchIndex = vi.fn().mockResolvedValue(JSON.stringify([]));

    await expect(loadBundledModIndex(fetchIndex)).resolves.toEqual([]);
    expect(fetchIndex).toHaveBeenCalledOnce();
  });

  test("service worker sends active mods with their grants", () => {
    const mod = { manifest: hideManifest, entry: "entry.js" };

    expect(
      selectActiveMods(
        [mod],
        "https://example.com/page",
        {},
        { "fixture.hide": ["visual.hide"] },
      ),
    ).toEqual({
      mods: [{ ...mod, grants: ["visual.hide"] }],
    });
  });

  test("optional grant changes preserve required capabilities", () => {
    const manifest: PrismManifest = {
      ...hideManifest,
      capabilities: {
        required: ["visual.hide"],
        optional: ["reddit.comments.search"],
      },
    };

    expect(
      updateOptionalGrant(manifest, [], "reddit.comments.search", true),
    ).toEqual(["visual.hide", "reddit.comments.search"]);
    expect(
      updateOptionalGrant(
        manifest,
        ["visual.hide", "reddit.comments.search"],
        "reddit.comments.search",
        false,
      ),
    ).toEqual(["visual.hide"]);
    expect(() =>
      updateOptionalGrant(manifest, [], "network.egress", true),
    ).toThrow("not optional");
  });

  test("rejects privileged service-worker messages from foreign senders", async () => {
    const setState = vi.fn();
    const dependencies: ServiceWorkerDependencies = {
      getState: vi.fn().mockResolvedValue({ enabled: {}, grants: {} }),
      setState,
      sendToTab: vi.fn(),
      reloadTab: vi.fn(),
      queryTabs: vi.fn().mockResolvedValue([]),
      syncBrowserRules: vi.fn(),
    };
    const mods = Promise.resolve([{ manifest: emptyManifest, entry: null }]);
    const auth = {
      extensionId: "fixture-extension",
      popupUrl: "chrome-extension://fixture-extension/popup.html",
    };

    for (const message of [
      { type: "list-mods" },
      { type: "set-enabled", modId: emptyManifest.id, enabled: false },
      {
        type: "set-capability",
        modId: emptyManifest.id,
        capability: "network.egress",
        granted: true,
      },
      {
        type: "network-request",
        modId: emptyManifest.id,
        contractId: "remote",
      },
      {
        type: "reddit-comments-search",
        modId: emptyManifest.id,
        query: "video",
      },
    ]) {
      await expect(
        handleRuntimeMessage(
          message,
          { id: "foreign-extension" },
          mods,
          dependencies,
          auth,
        ),
      ).resolves.toEqual({ ok: false });
    }
    expect(setState).not.toHaveBeenCalled();
  });

  test("allows grants only from this extension popup", async () => {
    const manifest: PrismManifest = {
      ...emptyManifest,
      capabilities: {
        required: [],
        optional: ["reddit.comments.search"],
      },
    };
    const setState = vi.fn();
    const dependencies: ServiceWorkerDependencies = {
      getState: vi.fn().mockResolvedValue({ enabled: {}, grants: {} }),
      setState,
      sendToTab: vi.fn(),
      reloadTab: vi.fn(),
      queryTabs: vi.fn().mockResolvedValue([]),
      syncBrowserRules: vi.fn(),
    };
    const mods = Promise.resolve([{ manifest, entry: null }]);
    const message = {
      type: "set-capability",
      modId: manifest.id,
      capability: "reddit.comments.search",
      granted: true,
    };
    const auth = {
      extensionId: "fixture-extension",
      popupUrl: "chrome-extension://fixture-extension/popup.html",
    };
    const contentSender = {
      id: "fixture-extension",
      url: "https://example.com/page",
      tab: { id: 7 },
    };

    await expect(
      handleRuntimeMessage(
        message,
        contentSender,
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: false });
    await expect(
      handleRuntimeMessage(
        { type: "set-enabled", modId: manifest.id, enabled: false },
        contentSender,
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: false });
    expect(setState).not.toHaveBeenCalled();

    await expect(
      handleRuntimeMessage(
        message,
        {
          id: "fixture-extension",
          url: "chrome-extension://fixture-extension/popup.html",
        },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });
    expect(setState).toHaveBeenCalledWith({
      grants: {
        [manifest.id]: ["reddit.comments.search"],
      },
    });
  });
});
