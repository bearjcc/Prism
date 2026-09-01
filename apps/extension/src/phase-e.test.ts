import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { loadUnpackedMod, type PrismApi } from "@prism/schema";
import { describe, expect, test, vi } from "vitest";
import { activate as activateYoutubeHomeMod } from "../../../mods/youtube-home-videos/src/index.js";
import {
  activateContentMods,
  createContentHandlers,
} from "./content-script.js";
import { createPrismApi, TabUndoStack } from "./prism-api.js";

const youtubeModRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "mods",
  "youtube-home-videos",
);

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
      Array.from(feed?.querySelectorAll("a") ?? []).map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual([
      "https://www.youtube.com/watch?v=video-alpha",
      "https://www.youtube.com/watch?v=video-beta",
    ]);
    expect(
      dom.window.document.querySelector("[data-fixture-kind='stray']"),
    ).toBe(stray);
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
      Array.from(feed?.querySelectorAll("a") ?? []).map((link) => [
        link.textContent,
        link.getAttribute("href"),
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
      Array.from(feed?.querySelectorAll("a") ?? []).map((link) =>
        link.textContent,
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
