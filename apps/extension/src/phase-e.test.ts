import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { loadUnpackedMod, type PrismApi } from "@prism/schema";
import { describe, expect, test, vi } from "vitest";
import { activate as activateYoutubeHomeMod } from "../../../mods/youtube-home-videos/src/index.js";
import {
  activateContentMods,
  createContentHandlers,
  MAX_YOUTUBE_HOME_UNDO_CHILDREN,
  youtubeHomeTileStylesheet,
} from "./content-script.js";
import { findYoutubeHomeFeed } from "./extractors/youtube-home.js";
import { createPrismApi, TabUndoStack } from "./prism-api.js";

const youtubeModRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "mods",
  "youtube-home-videos",
);

function findHomeFeed(document: Document): Element | null {
  return findYoutubeHomeFeed(document) ?? null;
}

describe("Phase E YouTube Home tracer", () => {
  test("the mod only requests the videos-only Home allowlist", async () => {
    const allowlist = vi.fn();
    const prism: PrismApi = {
      slots: { replace: vi.fn() },
      styles: { apply: vi.fn() },
      ui: { allowlist },
      extract: vi.fn(),
      net: { request: vi.fn() },
    };

    await activateYoutubeHomeMod(prism);

    expect(allowlist).toHaveBeenCalledOnce();
    expect(allowlist).toHaveBeenCalledWith("youtube.home", "video");
    expect(prism.extract).not.toHaveBeenCalled();
    expect(prism.styles.apply).not.toHaveBeenCalled();
    expect(prism.slots.replace).not.toHaveBeenCalled();
    expect(prism.net.request).not.toHaveBeenCalled();
  });

  test("Home with a query string still activates the videos-only allowlist", async () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, {
      url: "https://www.youtube.com/?app=desktop",
    });
    const youtubeManifest = loadUnpackedMod(youtubeModRoot).manifest;

    await expect(
      activateContentMods({
        url: "https://www.youtube.com/?app=desktop",
        requestActiveMods: vi.fn().mockResolvedValue({
          mods: [
            {
              manifest: youtubeManifest,
              entry: "bundled-mods/prism.youtube-home-videos/src/index.js",
              grants: ["youtube.home.allowlist"],
            },
          ],
        }),
        loadEntry: vi.fn().mockResolvedValue({
          activate: activateYoutubeHomeMod,
        }),
        handlers: createContentHandlers(dom.window.document),
        undo: new TabUndoStack(),
        contentDocument: dom.window.document,
      }),
    ).resolves.toEqual([{ id: "prism.youtube-home-videos", status: "active" }]);
    expect(
      dom.window.document.querySelectorAll(
        '[data-prism-owned="youtube-home-video"]',
      ),
    ).toHaveLength(2);
  });

  test("allowlist extracts videos from the Home feed, not the rest of the document", async () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const stray = dom.window.document.createElement("ytd-rich-item-renderer");
    stray.innerHTML = `
      <ytd-rich-grid-media>
        <a id="video-title-link" href="/watch?v=stray-outside">Stray outside</a>
      </ytd-rich-grid-media>
    `;
    stray.dataset.fixtureKind = "stray";
    dom.window.document.body.append(stray);

    const manifest = loadUnpackedMod(youtubeModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["youtube.home.allowlist"],
      tabId: 5,
      handlers: createContentHandlers(dom.window.document),
    });

    await activateYoutubeHomeMod(prism);

    const feed = dom.window.document.querySelector(
      "ytd-rich-grid-renderer #contents",
    );
    expect(
      Array.from(
        feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]') ?? [],
      ).map((tile) =>
        tile.querySelector("a.prism-yt-home-title")?.getAttribute("href"),
      ),
    ).toEqual([
      "https://www.youtube.com/watch?v=video-alpha",
      "https://www.youtube.com/watch?v=video-beta",
    ]);
    expect(
      dom.window.document.querySelector("[data-fixture-kind='stray']"),
    ).toBe(stray);
  });

  test("allowlist removes live-shaped Shorts, posts, and ads from the Home feed", async () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home-live.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const manifest = loadUnpackedMod(youtubeModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["youtube.home.allowlist"],
      tabId: 5,
      handlers: createContentHandlers(dom.window.document),
    });

    await activateYoutubeHomeMod(prism);

    const feed = findHomeFeed(dom.window.document);
    expect(
      feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]'),
    ).toHaveLength(3);
    expect(feed?.querySelector("[data-fixture-kind]")).toBeNull();
    expect(
      Array.from(
        feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]') ?? [],
      ).map((tile) => [
        tile.querySelector("a.prism-yt-home-title")?.textContent,
        tile.querySelector("a.prism-yt-home-title")?.getAttribute("href"),
      ]),
    ).toEqual([
      ["Lockup alpha video", "https://www.youtube.com/watch?v=lockup-alpha"],
      ["Lockup beta video", "https://www.youtube.com/watch?v=lockup-beta"],
      ["Lockup gamma video", "https://www.youtube.com/watch?v=lockup-gamma"],
    ]);
    const firstTile = feed?.querySelector('[data-prism-owned="youtube-home-video"]');
    expect(firstTile?.querySelector("img")?.getAttribute("src")).toBe(
      "https://i.ytimg.com/vi/lockup-alpha/hqdefault.jpg",
    );
    expect(
      dom.window.document.getElementById("prism-youtube-home-tiles"),
    ).not.toBeNull();
    expect(youtubeHomeTileStylesheet()).toContain(
      "repeat(auto-fill, minmax(280px, 1fr))",
    );
    expect(feed?.getAttribute("data-prism-youtube-home-grid")).toBe("true");
    expect(feed?.style.display).toBe("grid");
  });

  test("owned Home tile titles are visible under YouTube feed anchor styles", async () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home-live.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const youtubeCss = dom.window.document.createElement("style");
    youtubeCss.textContent = `
      ytd-rich-grid-renderer a > :not(img) {
        display: none !important;
        visibility: hidden !important;
      }
      ytd-rich-grid-renderer a {
        font-size: 0 !important;
        line-height: 0 !important;
        color: transparent !important;
      }
    `;
    dom.window.document.head.append(youtubeCss);

    const manifest = loadUnpackedMod(youtubeModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["youtube.home.allowlist"],
      tabId: 5,
      handlers: createContentHandlers(dom.window.document),
    });

    await activateYoutubeHomeMod(prism);

    const feed = findHomeFeed(dom.window.document);
    const tiles = Array.from(
      feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]') ?? [],
    );
    expect(tiles).toHaveLength(3);
    for (const tile of tiles) {
      const title = tile.querySelector(".prism-yt-home-title");
      expect(title?.textContent?.trim()).not.toBe("");
      const computed = dom.window.getComputedStyle(title!);
      expect(computed.display).not.toBe("none");
      expect(computed.visibility).not.toBe("hidden");
      expect(parseFloat(computed.fontSize)).toBeGreaterThan(0);
      expect(computed.color).not.toBe("transparent");
    }
    expect(tiles[0]?.querySelector(".prism-yt-home-title")?.textContent).toBe(
      "Lockup alpha video",
    );
  });

  test("allowlist never throws through the Prism API on broken feed children", async () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home-live.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const feed = findHomeFeed(dom.window.document);
    const broken = dom.window.document.createElement("ytd-rich-item-renderer");
    broken.innerHTML = `
      <ytd-rich-grid-media>
        <a id="video-title-link" href="/watch?v=broken-child">Broken child</a>
      </ytd-rich-grid-media>
    `;
    broken.replaceWith = () => {
      throw new DOMException("replace blocked");
    };
    broken.remove = () => {
      throw new DOMException("remove blocked");
    };
    feed?.append(broken);

    const manifest = loadUnpackedMod(youtubeModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["youtube.home.allowlist"],
      tabId: 5,
      handlers: createContentHandlers(dom.window.document),
    });

    expect(() => {
      prism.ui.allowlist("youtube.home", "video");
    }).not.toThrow();
    expect(
      feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]'),
    ).toHaveLength(3);
    expect(
      broken.getAttribute("data-prism-owned") === "youtube-home-hidden" ||
        broken.parentNode === null,
    ).toBe(true);
  });

  test("allowlist survives hostile feed children that reject DOM mutation", async () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home-live.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const feed = findHomeFeed(dom.window.document);
    const hostile = dom.window.document.createElement("ytd-rich-section-renderer");
    hostile.setAttribute("data-fixture-kind", "hostile");
    hostile.innerHTML = "<p>Hostile shelf</p>";
    hostile.replaceWith = () => {
      throw new DOMException("replace blocked");
    };
    hostile.remove = () => {
      throw new DOMException("remove blocked");
    };
    feed?.append(hostile);

    const manifest = loadUnpackedMod(youtubeModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["youtube.home.allowlist"],
      tabId: 5,
      handlers: createContentHandlers(dom.window.document),
    });

    await expect(activateYoutubeHomeMod(prism)).resolves.toBeUndefined();
    expect(
      feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]'),
    ).toHaveLength(3);
    expect(feed?.querySelector("[data-fixture-kind='hostile']")).not.toBeNull();
  });

  test("allowlist skips undo snapshot on large live feeds", () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home-live.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const feed = findHomeFeed(dom.window.document);
    expect(feed).not.toBeNull();
    for (let i = 0; i < MAX_YOUTUBE_HOME_UNDO_CHILDREN + 1; i += 1) {
      const filler = dom.window.document.createElement("ytd-rich-item-renderer");
      filler.setAttribute("data-fixture-kind", `filler-${i}`);
      filler.textContent = "Filler";
      feed?.append(filler);
    }
    const handlers = createContentHandlers(dom.window.document);
    const undo = handlers.allowlist?.("youtube.home", "video");
    expect(undo).toBeUndefined();
    expect(
      feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]'),
    ).toHaveLength(3);
  });

  test("allowlist skips feed children that are already detached", () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home-live.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const feed = findHomeFeed(dom.window.document);
    const detached = feed?.querySelector("[data-fixture-kind='post']");
    detached?.remove();
    const handlers = createContentHandlers(dom.window.document);
    expect(() => {
      handlers.allowlist?.("youtube.home", "video");
    }).not.toThrow();
    expect(
      feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]'),
    ).toHaveLength(3);
  });

  test("undo survives a stale Home feed after YouTube re-renders", async () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const manifest = loadUnpackedMod(youtubeModRoot).manifest;
    const undo = new TabUndoStack();
    const prism = createPrismApi({
      manifest,
      grants: ["youtube.home.allowlist"],
      tabId: 5,
      handlers: createContentHandlers(dom.window.document),
      undo,
    });

    await activateYoutubeHomeMod(prism);

    const feed = dom.window.document.querySelector(
      "ytd-rich-grid-renderer #contents",
    );
    feed?.replaceChildren(dom.window.document.createElement("div"));

    expect(() => undo.undoLast(5)).not.toThrow();
    expect(undo.undoLast(5)).toBe(false);
  });

  test("activateContentMods loads bundled entry files instead of sandbox entrySource", async () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home-live.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const manifest = loadUnpackedMod(youtubeModRoot).manifest;
    const loadEntry = vi.fn().mockResolvedValue({
      activate: activateYoutubeHomeMod,
    });

    await activateContentMods({
      url: "https://www.youtube.com/",
      requestActiveMods: async () => ({
        mods: [
          {
            manifest,
            entry: "bundled-mods/prism.youtube-home-videos/src/index.js",
            entrySource:
              "export async function activate() { throw new Error('sandbox path'); }",
            grants: ["youtube.home.allowlist"],
          },
        ],
      }),
      loadEntry,
      handlers: createContentHandlers(dom.window.document),
      undo: new TabUndoStack(),
      contentDocument: dom.window.document,
    });

    expect(loadEntry).toHaveBeenCalledWith(
      "bundled-mods/prism.youtube-home-videos/src/index.js",
    );
    expect(
      findHomeFeed(dom.window.document)?.querySelectorAll(
        '[data-prism-owned="youtube-home-video"]',
      ),
    ).toHaveLength(3);
  });

  test("mounts only extracted videos and restores the fixture on undo", async () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const manifest = loadUnpackedMod(youtubeModRoot).manifest;
    const undo = new TabUndoStack();
    const prism = createPrismApi({
      manifest,
      grants: ["youtube.home.allowlist"],
      tabId: 5,
      handlers: createContentHandlers(dom.window.document),
      undo,
    });

    await activateYoutubeHomeMod(prism);

    const feed = dom.window.document.querySelector(
      "ytd-rich-grid-renderer #contents",
    );
    expect(
      feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]'),
    ).toHaveLength(2);
    expect(
      Array.from(
        feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]') ?? [],
      ).map((tile) => [
        tile.querySelector("a.prism-yt-home-title")?.textContent,
        tile.querySelector("a.prism-yt-home-title")?.getAttribute("href"),
      ]),
    ).toEqual([
      ["Alpha video", "https://www.youtube.com/watch?v=video-alpha"],
      ["Beta video", "https://www.youtube.com/watch?v=video-beta"],
    ]);
    expect(feed?.querySelector("[data-fixture-kind]")).toBeNull();

    expect(undo.undoLast(5)).toBe(true);
    expect(feed?.querySelectorAll("[data-fixture-kind]")).toHaveLength(7);
  });

  test("allowlist converts a late native card without wiping owned tiles", async () => {
    const fixture = readFileSync(
      join(youtubeModRoot, "fixtures", "home.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.youtube.com/" });
    const manifest = loadUnpackedMod(youtubeModRoot).manifest;
    const handlers = createContentHandlers(dom.window.document);
    const prism = createPrismApi({
      manifest,
      grants: ["youtube.home.allowlist"],
      tabId: 5,
      handlers,
    });

    await activateYoutubeHomeMod(prism);

    const feed = dom.window.document.querySelector(
      "ytd-rich-grid-renderer #contents",
    );
    const late = dom.window.document.createElement("ytd-rich-item-renderer");
    late.setAttribute("data-fixture-kind", "video");
    late.innerHTML = `
      <ytd-rich-grid-media>
        <a id="video-title-link" href="/watch?v=video-gamma">Gamma video</a>
      </ytd-rich-grid-media>
    `;
    feed?.append(late);

    await activateYoutubeHomeMod(prism);

    expect(
      feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]'),
    ).toHaveLength(3);
    expect(feed?.querySelector("[data-fixture-kind]")).toBeNull();
    expect(
      Array.from(
        feed?.querySelectorAll('[data-prism-owned="youtube-home-video"]') ?? [],
      ).map(
        (tile) => tile.querySelector("a.prism-yt-home-title")?.textContent,
      ),
    ).toEqual(["Alpha video", "Beta video", "Gamma video"]);
  });

  test("waits for a late Home feed before activating the allowlist", async () => {
    const dom = new JSDOM("", { url: "https://www.youtube.com/" });
    const youtubeManifest = loadUnpackedMod(youtubeModRoot).manifest;
    const loadEntry = vi.fn().mockResolvedValue({
      activate: activateYoutubeHomeMod,
    });
    const activation = activateContentMods({
      url: dom.window.location.href,
      requestActiveMods: vi.fn().mockResolvedValue({
        mods: [
          {
            manifest: youtubeManifest,
            entry: "bundled-mods/prism.youtube-home-videos/src/index.js",
            grants: ["youtube.home.allowlist"],
          },
        ],
      }),
      loadEntry,
      handlers: createContentHandlers(dom.window.document),
      undo: new TabUndoStack(),
      contentDocument: dom.window.document,
      youtubeHomeWaitMs: 100,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadEntry).not.toHaveBeenCalled();

    const fixture = new JSDOM(
      readFileSync(join(youtubeModRoot, "fixtures", "home.html"), "utf8"),
    );
    dom.window.document.body.append(
      fixture.window.document.querySelector("ytd-rich-grid-renderer")!,
    );

    await activation;
    expect(loadEntry).toHaveBeenCalledOnce();
    expect(
      dom.window.document.querySelectorAll(
        '[data-prism-owned="youtube-home-video"]',
      ),
    ).toHaveLength(2);
  });

  test("a missing Home feed cannot stall a sibling mod forever", async () => {
    const dom = new JSDOM("", { url: "https://www.youtube.com/" });
    const youtubeManifest = loadUnpackedMod(youtubeModRoot).manifest;
    const siblingManifest = {
      id: "fixture.sibling",
      version: "1.0.0",
      runtime: "native" as const,
      capabilities: { required: [] },
      scopes: ["<all_urls>"],
    };
    const siblingActivate = vi.fn();
    const loadEntry = vi.fn(async (entry: string) =>
      entry.endsWith("sibling.js")
        ? { activate: siblingActivate }
        : { activate: activateYoutubeHomeMod },
    );

    const activation = activateContentMods({
      url: dom.window.location.href,
      requestActiveMods: vi.fn().mockResolvedValue({
        mods: [
          {
            manifest: youtubeManifest,
            entry: "bundled-mods/prism.youtube-home-videos/src/index.js",
            grants: ["youtube.home.allowlist"],
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
      youtubeHomeWaitMs: 25,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(siblingActivate).toHaveBeenCalledOnce();
    await expect(activation).resolves.toEqual([
      { id: "prism.youtube-home-videos", status: "active" },
      { id: "fixture.sibling", status: "active" },
    ]);
  });
});
