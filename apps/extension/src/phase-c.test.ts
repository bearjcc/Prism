import { describe, expect, test, vi } from "vitest";
import type { PrismManifest } from "@prism/schema";
import { packMod } from "@prism/schema";
import { sanitiseCss } from "./css.js";
import {
  encodeArchiveForStorage,
  installedModFromPackedArchive,
  mergeInstalledMods,
} from "./packed-mod.js";
import {
  classifyModTrust,
  loadNativeMods,
  matchesAnyScope,
  parseBundledMods,
  probeUserScriptsAvailable,
  userscriptRegistrations,
} from "./loader.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  activateContentMods,
  applyCosmeticHides,
  createContentHandlers,
  createContentSession,
  handleContentMessage,
  pageNeedsSurfaceRefresh,
  waitForAdSlot,
  watchPageSurfaces,
  watchSpaNavigation,
} from "./content-script.js";
import { createPrismApi, TabUndoStack } from "./prism-api.js";
import {
  forwardUndoToTab,
  handleRuntimeMessage,
  historyStateUpdatedMessage,
  loadBundledModIndex,
  selectActiveMods,
  syncRegisteredUserScripts,
  type ServiceWorkerDependencies,
  type StoredState,
  updateOptionalGrant,
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

const userscriptManifest: PrismManifest = {
  id: "fixture.userscript",
  version: "1.0.0",
  runtime: "userscript",
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

  test("forwards capability-gate events from an activated mod", async () => {
    const emit = vi.fn();

    await loadNativeMods(
      [
        {
          manifest: hideManifest,
          activate: (prism) => {
            prism.styles.apply(".advert { display: none; }");
          },
        },
      ],
      {
        url: "https://example.com/page",
        tabId: 1,
        grantsByMod: { "fixture.hide": ["visual.hide"] },
        handlers: { applyCss: () => undefined },
        emit,
      },
    );

    expect(emit).toHaveBeenCalledWith({
      layer: "capability-gate",
      modId: "fixture.hide",
      capability: "visual.hide",
      outcome: "allowed",
    });
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

  test("classifies css, declarative, and userscript trust kinds", () => {
    expect(
      classifyModTrust({
        manifest: { ...emptyManifest, filters: { browser: ["filters/browser/ads.txt"] } },
        entry: null,
      }),
    ).toBe("declarative");
    expect(
      classifyModTrust({
        manifest: emptyManifest,
        entry: null,
        styles: [".page { color: black; }"],
      }),
    ).toBe("css");
    expect(
      classifyModTrust({
        manifest: hideManifest,
        entry: "src/index.js",
      }),
    ).toBe("declarative");
    expect(
      classifyModTrust({
        manifest: userscriptManifest,
        entry: "src/index.js",
        styles: ["body { display: none; }"],
      }),
    ).toBe("userscript");
  });

  test("does not execute userscript entry when the Chrome API is unavailable", async () => {
    const activate = vi.fn();
    const emit = vi.fn();

    const states = await loadNativeMods(
      [{ manifest: userscriptManifest, activate }],
      {
        url: "https://example.com/page",
        tabId: 1,
        grantsByMod: { "fixture.userscript": ["visual.hide"] },
        handlers: {},
        emit,
        userscriptsAvailable: false,
      },
    );

    expect(states).toEqual([
      { id: "fixture.userscript", status: "userscript-blocked" },
    ]);
    expect(activate).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith({
      layer: "userscript-runtime",
      modId: "fixture.userscript",
      outcome: "denied",
    });
  });

  test("still activates native JS when the userscript API is off", async () => {
    const activate = vi.fn();

    const states = await loadNativeMods(
      [{ manifest: emptyManifest, activate }],
      {
        url: "https://example.com/page",
        tabId: 1,
        grantsByMod: {},
        handlers: {},
        userscriptsAvailable: false,
      },
    );

    expect(states).toEqual([{ id: "fixture.empty", status: "active" }]);
    expect(activate).toHaveBeenCalledOnce();
  });

  test("content script does not import userscript modules", async () => {
    const loadEntry = vi.fn();
    const applyCss = vi.fn();

    await expect(
      activateContentMods({
        url: "https://example.com/page",
        requestActiveMods: async () => ({
          mods: [
            {
              manifest: userscriptManifest,
              entry: "imported/fixture.userscript/src/index.js",
              entrySource: "window.hacked = true;",
              grants: ["visual.hide"],
              styles: [".ok { color: green; }"],
            },
          ],
          userscriptsAvailable: false,
        }),
        loadEntry,
        handlers: { applyCss },
        undo: new TabUndoStack(),
      }),
    ).resolves.toEqual([
      { id: "fixture.userscript", status: "userscript-blocked" },
    ]);

    expect(loadEntry).not.toHaveBeenCalled();
    expect(applyCss).toHaveBeenCalledWith(".ok { color: green; }");
  });

  test("registers only yaml-flagged userscripts that have source", () => {
    expect(
      userscriptRegistrations(
        [
          {
            manifest: userscriptManifest,
            entry: "imported/fixture.userscript/src/index.js",
            entrySource: "document.title = 'ok';",
          },
          {
            manifest: hideManifest,
            entry: "src/index.js",
            entrySource: "export const native = true;",
          },
        ],
        {},
      ),
    ).toEqual([
      {
        id: "fixture.userscript",
        matches: ["https://example.com/*"],
        js: [{ code: "document.title = 'ok';" }],
        world: "USER_SCRIPT",
      },
    ]);
    expect(
      userscriptRegistrations(
        [
          {
            manifest: userscriptManifest,
            entry: "imported/fixture.userscript/src/index.js",
            entrySource: "document.title = 'ok';",
          },
        ],
        { "fixture.userscript": false },
      ),
    ).toEqual([]);
  });

  test("probeUserScriptsAvailable treats missing and throwing APIs as off", async () => {
    await expect(probeUserScriptsAvailable(undefined)).resolves.toBe(false);
    await expect(
      probeUserScriptsAvailable({
        getScripts: async () => {
          throw new Error("User Scripts API is not available");
        },
      }),
    ).resolves.toBe(false);
    await expect(
      probeUserScriptsAvailable({
        getScripts: async () => [],
      }),
    ).resolves.toBe(true);
  });

  test("drops reversible undos for a tab without running them", () => {
    const undo = new TabUndoStack();
    const reverted = vi.fn();
    undo.push(0, reverted);
    undo.clear(0);
    expect(undo.undoLast(0)).toBe(false);
    expect(reverted).not.toHaveBeenCalled();
  });

  test("historyStateUpdated notifies only the top frame", () => {
    expect(
      historyStateUpdatedMessage({
        frameId: 0,
        tabId: 9,
        url: "https://www.youtube.com/watch?v=abc",
      }),
    ).toEqual({
      tabId: 9,
      message: {
        type: "url-changed",
        url: "https://www.youtube.com/watch?v=abc",
      },
    });
    expect(
      historyStateUpdatedMessage({
        frameId: 1,
        tabId: 9,
        url: "https://www.youtube.com/watch?v=abc",
      }),
    ).toBeUndefined();
  });

  test("watchSpaNavigation fires once when the href changes", () => {
    const dom = new JSDOM("<!doctype html><p>home</p>", {
      url: "https://www.youtube.com/",
    });
    const onNavigate = vi.fn();
    const stop = watchSpaNavigation({
      getHref: () => dom.window.location.href,
      onNavigate,
      history: dom.window.history,
      target: dom.window,
    });

    dom.window.history.pushState({}, "", "/watch?v=abc");
    expect(onNavigate).toHaveBeenCalledWith(
      "https://www.youtube.com/watch?v=abc",
    );

    onNavigate.mockClear();
    dom.window.dispatchEvent(new dom.window.Event("yt-navigate-finish"));
    expect(onNavigate).not.toHaveBeenCalled();

    stop();
  });

  test("aborts an in-flight slot wait so a later session can run", async () => {
    const document = new JSDOM("<!doctype html><html></html>").window
      .document;
    const controller = new AbortController();
    const waiting = waitForAdSlot(document, 5_000, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  });

  test("pageNeedsSurfaceRefresh is true for an unreplaced live advert", () => {
    const document = new JSDOM(`
      <ytd-ad-slot-renderer>Sponsored</ytd-ad-slot-renderer>
    `).window.document;
    expect(pageNeedsSurfaceRefresh(document)).toBe(true);
  });

  test("pageNeedsSurfaceRefresh is false once slots and Home tiles are owned", () => {
    const document = new JSDOM(`
      <aside data-prism-ad-slot="banner">
        <img data-prism-owned="true" alt="kitten">
      </aside>
      <ytd-rich-grid-renderer>
        <div id="contents">
          <article data-prism-owned="youtube-home-video"></article>
        </div>
      </ytd-rich-grid-renderer>
    `).window.document;
    expect(pageNeedsSurfaceRefresh(document)).toBe(false);
  });

  test("pageNeedsSurfaceRefresh is true for an undismissed idle prompt", () => {
    const document = new JSDOM(`
      <yt-confirm-dialog-renderer>
        <button id="confirm-button" type="button">Yes</button>
      </yt-confirm-dialog-renderer>
    `).window.document;
    expect(pageNeedsSurfaceRefresh(document)).toBe(true);
  });

  test("pageNeedsSurfaceRefresh is true for an enabled YouTube autonav toggle", () => {
    const document = new JSDOM(`
      <button class="ytp-autonav-toggle-button" aria-checked="true" type="button">
        Autoplay
      </button>
    `).window.document;
    expect(pageNeedsSurfaceRefresh(document)).toBe(true);
  });

  test("youtube.watch.constrainAutoplay extract clicks autonav and stops refresh", async () => {
    const document = new JSDOM(`
      <button class="ytp-autonav-toggle-button" aria-checked="true" type="button">
        Autoplay
      </button>
      <video class="html5-main-video" autoplay></video>
    `).window.document;
    const clicks: string[] = [];
    document
      .querySelector(".ytp-autonav-toggle-button")
      ?.addEventListener("click", () => {
        clicks.push("autonav");
      });
    const handlers = createContentHandlers(document);

    await expect(
      handlers.extract?.("youtube.watch.constrainAutoplay"),
    ).resolves.toEqual({
      constrained: true,
      kind: "autonav",
    });
    expect(clicks).toEqual(["autonav"]);
    expect(pageNeedsSurfaceRefresh(document)).toBe(false);
  });

  test("pageNeedsSurfaceRefresh is true for a YouTube end-screen overlay", () => {
    const document = new JSDOM(`
      <div class="ytp-endscreen-content">Suggested videos</div>
    `).window.document;
    expect(pageNeedsSurfaceRefresh(document)).toBe(true);
  });

  test("youtube.watch.constrainEndScreens extract hides overlays and stops refresh", async () => {
    const document = new JSDOM(`
      <div class="ytp-endscreen-content">Suggested videos HTML</div>
      <div class="ytp-ce-element">Card overlay HTML</div>
    `).window.document;
    const handlers = createContentHandlers(document);

    await expect(
      handlers.extract?.("youtube.watch.constrainEndScreens"),
    ).resolves.toEqual({
      constrained: true,
      kind: "endscreen",
    });
    expect(document.querySelector(".ytp-endscreen-content")?.hidden).toBe(true);
    expect(pageNeedsSurfaceRefresh(document)).toBe(false);
  });

  test("pageNeedsSurfaceRefresh is true for a YouTube miniplayer", () => {
    const document = new JSDOM(`
      <ytd-miniplayer>
        <button class="ytp-miniplayer-close-button" type="button">Close</button>
      </ytd-miniplayer>
    `).window.document;
    expect(pageNeedsSurfaceRefresh(document)).toBe(true);
  });

  test("youtube.watch.constrainMiniplayer extract hides the shell and stops refresh", async () => {
    const document = new JSDOM(`
      <ytd-miniplayer>
        <div class="miniplayer-scrim">Now playing HTML</div>
        <button class="ytp-miniplayer-close-button" type="button">Close</button>
      </ytd-miniplayer>
    `).window.document;
    const clicks: string[] = [];
    document
      .querySelector(".ytp-miniplayer-close-button")
      ?.addEventListener("click", () => {
        clicks.push("close");
      });
    const handlers = createContentHandlers(document);

    await expect(
      handlers.extract?.("youtube.watch.constrainMiniplayer"),
    ).resolves.toEqual({
      constrained: true,
      kind: "miniplayer",
    });
    expect(clicks).toEqual(["close"]);
    expect(document.querySelector("ytd-miniplayer")?.hidden).toBe(true);
    expect(pageNeedsSurfaceRefresh(document)).toBe(false);
  });

  test("youtube.watch.dismissIdle extract clicks confirm and stops refresh", async () => {
    const document = new JSDOM(`
      <yt-confirm-dialog-renderer data-prism-idle-prompt="continue-watching">
        <button id="confirm-button" type="button">Yes</button>
      </yt-confirm-dialog-renderer>
    `).window.document;
    const clicks: string[] = [];
    document.querySelector("#confirm-button")?.addEventListener("click", () => {
      clicks.push("confirm");
    });
    const handlers = createContentHandlers(document);

    await expect(
      handlers.extract?.("youtube.watch.dismissIdle"),
    ).resolves.toEqual({
      dismissed: true,
      kind: "continue-watching",
    });
    expect(clicks).toEqual(["confirm"]);
    expect(pageNeedsSurfaceRefresh(document)).toBe(false);
  });

  test("search.results.directLinks extract unwraps Google /url redirects", async () => {
    const document = new JSDOM(
      `<a id="hit" href="/url?q=https%3A%2F%2Fexample.com%2Fok">Ok</a>`,
      { url: "https://www.google.com/search?q=ok" },
    ).window.document;
    const handlers = createContentHandlers(document);

    await expect(
      handlers.extract?.("search.results.directLinks"),
    ).resolves.toEqual({
      links: [
        { id: "hit", href: "https://example.com/ok", title: "Ok" },
      ],
    });
    expect(document.querySelector("#hit")?.getAttribute("href")).toBe(
      "https://example.com/ok",
    );
    expect(pageNeedsSurfaceRefresh(document)).toBe(false);
  });

  test("pageNeedsSurfaceRefresh is true for wrapped search result links", () => {
    const document = new JSDOM(
      `<a href="/url?q=https%3A%2F%2Fexample.com%2Fok">Ok</a>`,
      { url: "https://www.google.com/search?q=ok" },
    ).window.document;
    expect(pageNeedsSurfaceRefresh(document)).toBe(true);
  });

  test("pageNeedsSurfaceRefresh is true for unlabelled Reddit feed posts", () => {
    const document = new JSDOM(
      `
      <shreddit-post>
        <a slot="title">Late keyword post</a>
      </shreddit-post>
    `,
      { url: "https://www.reddit.com/r/all/" },
    ).window.document;
    expect(pageNeedsSurfaceRefresh(document)).toBe(true);
  });

  test("reddit.feed.posts extract labels posts and stops refresh", async () => {
    const document = new JSDOM(
      `
      <shreddit-post>
        <a slot="title">Weekend hiking thread</a>
      </shreddit-post>
    `,
      { url: "https://www.reddit.com/r/all/" },
    ).window.document;
    const handlers = createContentHandlers(document);

    await expect(handlers.extract?.("reddit.feed.posts")).resolves.toEqual({
      posts: [{ id: "live:shreddit-post:0", title: "Weekend hiking thread" }],
    });
    expect(pageNeedsSurfaceRefresh(document)).toBe(false);
  });

  test("watchPageSurfaces notifies when a live advert is added", async () => {
    const dom = new JSDOM("<!doctype html><main></main>");
    const onChange = vi.fn();
    const stop = watchPageSurfaces(dom.window.document, onChange, {
      debounceMs: 0,
    });

    const slot = dom.window.document.createElement("ytd-ad-slot-renderer");
    slot.textContent = "Sponsored";
    dom.window.document.querySelector("main")?.append(slot);
    await Promise.resolve();
    await new Promise((resolve) => {
      dom.window.setTimeout(resolve, 0);
    });

    expect(onChange).toHaveBeenCalled();
    stop();
  });

  test("content session refresh re-activates without clearing undos", async () => {
    const undo = new TabUndoStack();
    const reverted = vi.fn();
    const activate = vi.fn();
    const loadEntry = vi.fn().mockResolvedValue({ activate });
    const session = createContentSession({
      requestActiveMods: vi.fn().mockResolvedValue({
        mods: [
          {
            manifest: hideManifest,
            entry: "bundled-mods/fixture.hide/src/index.js",
            grants: ["visual.hide"],
          },
        ],
      }),
      loadEntry,
      handlers: {},
      undo,
    });

    await session.run("https://example.com/page");
    undo.push(0, reverted);
    await session.refresh("https://example.com/page");

    expect(activate).toHaveBeenCalledTimes(2);
    expect(reverted).not.toHaveBeenCalled();
    expect(undo.undoLast(0)).toBe(true);
    expect(reverted).toHaveBeenCalledOnce();
  });

  test("content session clears stale active ids and undos on SPA navigation", async () => {
    const undo = new TabUndoStack();
    const reverted = vi.fn();
    undo.push(0, reverted);
    const loadEntry = vi.fn().mockResolvedValue({ activate: vi.fn() });
    const requestActiveMods = vi
      .fn()
      .mockResolvedValueOnce({
        mods: [
          {
            manifest: hideManifest,
            entry: "bundled-mods/fixture.hide/src/index.js",
            grants: ["visual.hide"],
          },
        ],
      })
      .mockResolvedValueOnce({ mods: [] });
    const session = createContentSession({
      requestActiveMods,
      loadEntry,
      handlers: {},
      undo,
    });

    await session.run("https://example.com/page");
    expect(
      handleContentMessage(
        { type: "is-mod-active", modId: "fixture.hide" },
        undo,
        session.activeModIds,
      ),
    ).toEqual({ active: true });

    await session.run("https://example.com/other");
    expect(reverted).not.toHaveBeenCalled();
    expect(
      handleContentMessage(
        { type: "is-mod-active", modId: "fixture.hide" },
        undo,
        session.activeModIds,
      ),
    ).toEqual({ active: false });
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

    await expect(prism.extract("reddit.comments.search")).resolves.toBeUndefined();
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

    await expect(modA.extract("reddit.comments.search")).resolves.toBeUndefined();
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

  test("no-ops CSS that is outside the runtime allowlist", () => {
    const applyCss = vi.fn();
    const prism = createPrismApi({
      manifest: hideManifest,
      grants: ["visual.hide"],
      tabId: 1,
      handlers: { applyCss },
    });

    prism.styles.apply(".advert { unknown-property: value; }");

    expect(applyCss).not.toHaveBeenCalled();
  });

  test("rejects CSS with remote or import sources", () => {
    expect(() => sanitiseCss("a { background: url(https://x.test/a); }")).toThrow(
      "url(",
    );
    expect(() => sanitiseCss('@import "https://x.test/a.css";')).toThrow(
      "@import",
    );
    expect(() => sanitiseCss("@updateURL https://x.test/a")).toThrow(
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
    expect(() =>
      sanitiseCss("a { background: u/*x*/rl(https://x.test/a); }"),
    ).toThrow("url(");
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

    expect(mods).toEqual([
      { origin: "bundled", manifest: emptyManifest, entry: null },
    ]);
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

  test("site exception skips a mod on that origin only", () => {
    const mod = {
      manifest: { ...hideManifest, scopes: ["<all_urls>"] },
      entry: "entry.js",
    };

    expect(
      selectActiveMods(
        [mod],
        "https://meet.example/call",
        {},
        { "fixture.hide": ["visual.hide"] },
        { "fixture.hide": ["https://meet.example"] },
      ),
    ).toEqual({ mods: [] });
    expect(
      selectActiveMods(
        [mod],
        "https://example.com/page",
        {},
        { "fixture.hide": ["visual.hide"] },
        { "fixture.hide": ["https://meet.example"] },
      ),
    ).toEqual({
      mods: [{ ...mod, grants: ["visual.hide"] }],
    });
  });

  test("runtime pause skips every mod on that origin", () => {
    const mod = {
      manifest: { ...hideManifest, scopes: ["<all_urls>"] },
      entry: "entry.js",
    };
    expect(
      selectActiveMods(
        [mod],
        "https://meet.example/call",
        {},
        { "fixture.hide": ["visual.hide"] },
        {},
        {},
        {},
        ["https://meet.example"],
      ),
    ).toEqual({ mods: [] });
  });

  test("popup can record a site exception", async () => {
    const stored: StoredState = { enabled: {}, grants: {} };
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
    const mods = Promise.resolve([{ manifest: hideManifest, entry: null }]);

    await expect(
      handleRuntimeMessage(
        {
          type: "set-site-exception",
          modId: hideManifest.id,
          origin: "https://meet.example",
          excepted: true,
        },
        { id: "fixture-extension", url: auth.popupUrl },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });
    expect(stored.siteExceptions).toEqual({
      [hideManifest.id]: ["https://meet.example"],
    });

    await expect(
      handleRuntimeMessage(
        { type: "list-mods", url: "https://meet.example/call" },
        { id: "fixture-extension" },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        manifest: hideManifest,
        disabledOnOrigin: true,
      }),
    ]);
  });

  test("applies cosmetic hides for the current host", () => {
    const dom = new JSDOM(`<!doctype html><div id="AdBox">ad</div>`);
    const undo = applyCosmeticHides(
      dom.window.document,
      [{ selector: "#AdBox" }],
      "example.test",
    );
    const style = dom.window.document.querySelector(
      "style[data-prism-owned='cosmetic']",
    );
    expect(style?.textContent).toContain("#AdBox");
    expect(style?.textContent).toContain("display: none");
    undo();
    expect(
      dom.window.document.querySelector("style[data-prism-owned='cosmetic']"),
    ).toBe(null);
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
        type: "set-site-exception",
        modId: emptyManifest.id,
        origin: "https://meet.example",
        excepted: true,
      },
      {
        type: "set-mod-pause",
        modId: emptyManifest.id,
        origin: "https://example.com",
        paused: false,
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

  test("stores capability-gate events from this extension and lists them", async () => {
    const stored: StoredState = { enabled: {}, grants: {} };
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
    const event = {
      layer: "capability-gate" as const,
      modId: "fixture.hide",
      capability: "visual.hide" as const,
      outcome: "allowed" as const,
    };

    await expect(
      handleRuntimeMessage(
        { type: "activity-event", event },
        { id: "foreign-extension" },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: false });
    expect(stored.activity).toBeUndefined();

    await expect(
      handleRuntimeMessage(
        { type: "activity-event", event },
        { id: "fixture-extension", tab: { id: 4 } },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });
    expect(stored.activity?.[0]).toEqual(
      expect.objectContaining({
        ...event,
        at: expect.any(Number),
      }),
    );

    await expect(
      handleRuntimeMessage(
        { type: "list-activity" },
        { id: "fixture-extension" },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual(stored.activity);
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
    await expect(
      handleRuntimeMessage(
        {
          type: "set-site-exception",
          modId: manifest.id,
          origin: "https://meet.example",
          excepted: true,
        },
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

    await expect(
      handleRuntimeMessage(
        message,
        {
          id: "fixture-extension",
          url: "chrome-extension://fixture-extension/popup.html",
          tab: { id: 12 },
        },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });
  });

  test("loads an imported .prism zip through the same validator as pack", () => {
    const packed = packMod(goldenDir);
    const imported = installedModFromPackedArchive(
      packed.archive,
      "golden.prism",
    );

    expect(imported.origin).toBe("imported");
    expect(imported.manifest.id).toBe("golden.mod");
    expect(imported.entry).toBe("imported/golden.mod/src/index.js");
    expect(imported.entrySource).toContain("export function activate");
    expect(imported.assetUrls?.["assets/kitten.txt"]).toMatch(/^data:/u);
    expect(imported.files?.["filters/dns/ignored.txt"]).toBeUndefined();
  });

  test("refuses an imported archive whose id collides with a bundled mod", () => {
    const packed = packMod(goldenDir);
    const imported = installedModFromPackedArchive(
      packed.archive,
      "golden.prism",
    );
    const bundled = [
      {
        origin: "bundled" as const,
        manifest: { ...emptyManifest, id: "golden.mod" },
        entry: null,
      },
    ];

    expect(() => mergeInstalledMods(bundled, [imported])).toThrow(
      "conflicts with bundled mod",
    );
  });

  test("service worker persists an imported archive and lists it with bundled mods", async () => {
    const packed = packMod(goldenDir);
    const archive = encodeArchiveForStorage(packed.archive);
    const stored: StoredState = { enabled: {}, grants: {} };
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
    const bundled = [{ manifest: emptyManifest, entry: null, origin: "bundled" as const }];
    const auth = {
      extensionId: "fixture-extension",
      popupUrl: "chrome-extension://fixture-extension/popup.html",
    };
    const popupSender = {
      id: "fixture-extension",
      url: auth.popupUrl,
    };

    await expect(
      handleRuntimeMessage(
        { type: "import-mod", archive },
        popupSender,
        Promise.resolve(bundled),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true, id: "golden.mod" });
    expect(stored.importedArchives?.["golden.mod"]).toBe(archive);

    const listed = await handleRuntimeMessage(
      { type: "list-mods" },
      { id: "fixture-extension" },
      Promise.resolve(bundled),
      dependencies,
      auth,
    );
    expect(listed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          manifest: expect.objectContaining({ id: emptyManifest.id }),
          origin: "bundled",
        }),
        expect.objectContaining({
          manifest: expect.objectContaining({ id: "golden.mod" }),
          origin: "imported",
          enabled: true,
        }),
      ]),
    );
  });

  test("registers yaml-flagged userscripts only when the Chrome API probe succeeds", async () => {
    const register = vi.fn();
    const unregister = vi.fn();
    const mods = [
      {
        manifest: userscriptManifest,
        entry: "imported/fixture.userscript/src/index.js",
        entrySource: "document.title = 'ok';",
      },
    ];

    await expect(
      syncRegisteredUserScripts(mods, {}, undefined),
    ).resolves.toBe(false);
    await expect(
      syncRegisteredUserScripts(mods, {}, {
        getScripts: async () => {
          throw new Error("off");
        },
        unregister,
        register,
      }),
    ).resolves.toBe(false);
    expect(register).not.toHaveBeenCalled();

    await expect(
      syncRegisteredUserScripts(mods, {}, {
        getScripts: async () => [],
        unregister,
        register,
      }),
    ).resolves.toBe(true);
    expect(unregister).toHaveBeenCalledOnce();
    expect(register).toHaveBeenCalledWith([
      {
        id: "fixture.userscript",
        matches: ["https://example.com/*"],
        js: [{ code: "document.title = 'ok';" }],
        world: "USER_SCRIPT",
      },
    ]);
  });

  test("rejects import-mod from a content-script sender", async () => {
    const packed = packMod(goldenDir);
    const setState = vi.fn();
    await expect(
      handleRuntimeMessage(
        {
          type: "import-mod",
          archive: encodeArchiveForStorage(packed.archive),
        },
        {
          id: "fixture-extension",
          url: "https://example.com/page",
          tab: { id: 3 },
        },
        Promise.resolve([]),
        {
          getState: vi.fn().mockResolvedValue({}),
          setState,
          sendToTab: vi.fn(),
          reloadTab: vi.fn(),
          queryTabs: vi.fn().mockResolvedValue([]),
          syncBrowserRules: vi.fn(),
        },
        {
          extensionId: "fixture-extension",
          popupUrl: "chrome-extension://fixture-extension/popup.html",
        },
      ),
    ).resolves.toEqual({ ok: false });
    expect(setState).not.toHaveBeenCalled();
  });
});
