import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { loadPackedMod, packMod, validateManifest } from "@prism/schema";
import { describe, expect, test, vi } from "vitest";
import { sanitiseCss } from "./css.js";
import { compileBrowserFilters, compileCosmeticFilters, cosmeticHideCss } from "./dnr.js";
import { loadNativeMods } from "./loader.js";
import { createContentHandlers } from "./content-script.js";
import { activate as activateYoutubeNonstop } from "../../../corpus/userscripts/youtube-nonstop/src/index.js";
import { activate as activateYoutubeAutoplayOff } from "../../../corpus/userscripts/youtube-autoplay-off/src/index.js";
import { activate as activateYoutubeEndscreenOff } from "../../../corpus/userscripts/youtube-endscreen-off/src/index.js";
import { activate as activateYoutubeMiniplayerOff } from "../../../corpus/userscripts/youtube-miniplayer-off/src/index.js";
import { activate as activateSponsorblock } from "../../../corpus/userscripts/sponsorblock-segments/src/index.js";
import { activate as activateSearchDirectLinks } from "../../../corpus/userscripts/search-direct-links/src/index.js";
import { activate as activateYoutubeAdb } from "../../../corpus/userscripts/youtube-adb/src/index.js";
import { activate as activateRedditPlusPlus } from "../../../corpus/userscripts/reddit-plus-plus/src/index.js";
import { parseSponsorSegments } from "./extractors/sponsor-segments.js";
import {
  handleRuntimeMessage,
  type ServiceWorkerDependencies,
} from "./service-worker.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const corpusRoot = join(repoRoot, "corpus");
const inventory = JSON.parse(
  readFileSync(join(corpusRoot, "inventory.json"), "utf8"),
) as {
  usercss: Array<{
    id: string;
    directory: string;
    sanitise: "accept" | "reject";
  }>;
  filters: Array<{ id: string; directory: string }>;
  userscripts: Array<{
    id: string;
    directory: string;
    pack: "accept" | "reject-capability";
    capability?: string;
  }>;
};

function corpusDir(relative: string): string {
  return join(corpusRoot, relative);
}

function styleFiles(directory: string): string[] {
  const styles = join(directory, "styles");
  if (!existsSync(styles)) {
    return [];
  }
  return readdirSync(styles)
    .filter((name) => /\.(css|less)$/u.test(name))
    .map((name) => join(styles, name));
}

describe("corpus UserCSS", () => {
  test.each(inventory.usercss)("$id sanitise is $sanitise", (entry) => {
    const files = styleFiles(corpusDir(entry.directory));
    expect(files.length, `run node scripts/sync-corpus-from-references.mjs`).toBeGreaterThan(
      0,
    );
    const cssText = files.map((file) => readFileSync(file, "utf8")).join("\n");
    if (entry.sanitise === "accept") {
      const compiled = sanitiseCss(
        cssText,
        "https://github.com/example/repo",
      );
      expect(compiled).not.toMatch(/@-moz-document/u);
      expect(compiled).not.toMatch(/==UserStyle==/u);
      expect(compiled.length).toBeGreaterThan(20);
      const packed = packMod(corpusDir(entry.directory));
      expect(packed.manifest.id).toBe(entry.id);
      expect(loadPackedMod(packed.archive).manifest.runtime).toBe("native");
      return;
    }
    expect(() => sanitiseCss(cssText)).toThrow(/forbidden/u);
  });

  test("packMod rejects UserCSS that fails sanitiseCss", () => {
    const entry = inventory.usercss.find((item) => item.sanitise === "reject");
    expect(entry).toBeDefined();
    expect(() => packMod(corpusDir(entry!.directory))).toThrow(/forbidden/u);
  });

  test("UserCSS without src still injects styles/ on load", async () => {
    const applyCss = vi.fn();
    const directory = corpusDir("usercss/wide-github");
    const packed = packMod(directory);
    const loaded = loadPackedMod(packed.archive);
    const states = await loadNativeMods(
      [{ manifest: loaded.manifest, files: loaded.files }],
      {
        url: "https://github.com/example/repo",
        tabId: 1,
        grantsByMod: { [loaded.manifest.id]: ["visual.hide"] },
        handlers: { applyCss },
      },
    );
    expect(states[0]?.status).toBe("active");
    expect(applyCss).toHaveBeenCalled();
    const injected = String(applyCss.mock.calls[0]?.[0] ?? "");
    expect(injected).toContain("container-xl");
    expect(injected).not.toMatch(/@-moz-document/u);
  });
});

describe("corpus filters", () => {
  test("easylist host slice compiles to DNR", () => {
    const directory = corpusDir("filters/easylist-slice");
    const hosts = join(
      directory,
      "filters",
      "browser",
      "easylist-hosts.txt",
    );
    expect(existsSync(hosts), "run node scripts/sync-corpus-from-references.mjs").toBe(
      true,
    );
    const packed = packMod(directory);
    expect(packed.manifest.id).toBe("prism.corpus.easylist-slice");
    const rules = compileBrowserFilters([readFileSync(hosts, "utf8")]);
    expect(rules.length).toBeGreaterThan(0);
  });

  test("cosmetic ## rules become hide instructions", () => {
    const cosmetics = join(
      corpusRoot,
      "filters",
      "easylist-slice",
      "filters",
      "browser",
      "easylist-cosmetics.txt",
    );
    expect(existsSync(cosmetics)).toBe(true);
    const hides = compileCosmeticFilters([readFileSync(cosmetics, "utf8")]);
    expect(hides.length).toBeGreaterThan(0);
    expect(hides[0]?.selector).toMatch(/^#/u);
    const css = cosmeticHideCss(hides, "example.test");
    expect(css).toContain("display: none");
    expect(css).toContain(hides[0]?.selector ?? "");
  });
});

describe("corpus userscripts", () => {
  test.each(inventory.userscripts.filter((item) => item.pack === "accept"))(
    "$id packs as native",
    (entry) => {
      const packed = packMod(corpusDir(entry.directory));
      expect(packed.manifest.id).toBe(entry.id);
      expect(loadPackedMod(packed.archive).files["src/index.js"]).toBeDefined();
    },
  );

  test.each(
    inventory.userscripts.filter((item) => item.pack === "reject-capability"),
  )("$id is blocked until $capability exists", (entry) => {
    const source = readFileSync(
      join(corpusDir(entry.directory), "prism.yaml"),
      "utf8",
    );
    expect(() => validateManifest(source)).toThrow(entry.capability ?? "capability");
  });

  test.fails.each(
    inventory.userscripts.filter((item) => item.pack === "reject-capability"),
  )("$id packs once $capability is in the registry", (entry) => {
    const packed = packMod(corpusDir(entry.directory));
    expect(packed.manifest.capabilities.required).toContain(entry.capability);
  });

  test("youtube-nonstop extract dismisses the continue-watching prompt", async () => {
    const directory = corpusDir("userscripts/youtube-nonstop");
    const packed = packMod(directory);
    const loaded = loadPackedMod(packed.archive);
    const dom = new JSDOM(`
      <yt-confirm-dialog-renderer>
        <button id="confirm-button" type="button">Yes</button>
      </yt-confirm-dialog-renderer>
    `);
    const clicks: string[] = [];
    dom.window.document
      .querySelector("#confirm-button")
      ?.addEventListener("click", () => {
        clicks.push("confirm");
      });
    const states = await loadNativeMods(
      [
        {
          manifest: loaded.manifest,
          files: loaded.files,
          activate: activateYoutubeNonstop,
        },
      ],
      {
        url: "https://www.youtube.com/watch?v=fixture",
        tabId: 1,
        grantsByMod: {
          [loaded.manifest.id]: ["youtube.watch.dismissIdle"],
        },
        handlers: createContentHandlers(dom.window.document),
      },
    );
    expect(states[0]?.status).toBe("active");
    expect(clicks).toEqual(["confirm"]);
  });

  test("youtube-autoplay-off extract turns off autonav without HTML", async () => {
    const directory = corpusDir("userscripts/youtube-autoplay-off");
    const packed = packMod(directory);
    const loaded = loadPackedMod(packed.archive);
    const dom = new JSDOM(`
      <button class="ytp-autonav-toggle-button" aria-checked="true" type="button">
        Autoplay
      </button>
      <video class="html5-main-video" autoplay></video>
    `);
    const clicks: string[] = [];
    dom.window.document
      .querySelector(".ytp-autonav-toggle-button")
      ?.addEventListener("click", () => {
        clicks.push("autonav");
      });
    const states = await loadNativeMods(
      [
        {
          manifest: loaded.manifest,
          files: loaded.files,
          activate: activateYoutubeAutoplayOff,
        },
      ],
      {
        url: "https://www.youtube.com/watch?v=fixture",
        tabId: 1,
        grantsByMod: {
          [loaded.manifest.id]: ["youtube.watch.constrainAutoplay"],
        },
        handlers: createContentHandlers(dom.window.document),
      },
    );
    expect(states[0]?.status).toBe("active");
    expect(clicks).toEqual(["autonav"]);
    expect(
      dom.window.document
        .querySelector(".ytp-autonav-toggle-button")
        ?.getAttribute("aria-checked"),
    ).toBe("false");
    expect(
      dom.window.document.querySelector("video")?.hasAttribute("autoplay"),
    ).toBe(false);
  });

  test("youtube-endscreen-off extract hides overlays without HTML", async () => {
    const directory = corpusDir("userscripts/youtube-endscreen-off");
    const packed = packMod(directory);
    const loaded = loadPackedMod(packed.archive);
    const extracted: unknown[] = [];
    const dom = new JSDOM(`
      <div class="ytp-endscreen-content">Suggested videos HTML</div>
      <div class="ytp-ce-element">Card overlay HTML</div>
      <video class="html5-main-video"></video>
    `);
    const handlers = createContentHandlers(dom.window.document);
    const originalExtract = handlers.extract;
    const states = await loadNativeMods(
      [
        {
          manifest: loaded.manifest,
          files: loaded.files,
          activate: activateYoutubeEndscreenOff,
        },
      ],
      {
        url: "https://www.youtube.com/watch?v=fixture",
        tabId: 1,
        grantsByMod: {
          [loaded.manifest.id]: ["youtube.watch.constrainEndScreens"],
        },
        handlers: {
          ...handlers,
          extract: async (capability, input, manifest) => {
            const result = await originalExtract?.(capability, input, manifest);
            extracted.push(result);
            return result;
          },
        },
      },
    );
    expect(states[0]?.status).toBe("active");
    expect(extracted[0]).toEqual({
      constrained: true,
      kind: "endscreen",
    });
    expect(JSON.stringify(extracted[0])).not.toMatch(/</u);
    expect(
      dom.window.document.querySelector(".ytp-endscreen-content")?.hidden,
    ).toBe(true);
    expect(dom.window.document.querySelector(".ytp-ce-element")?.hidden).toBe(
      true,
    );
  });

  test("youtube-miniplayer-off extract hides the miniplayer without HTML", async () => {
    const directory = corpusDir("userscripts/youtube-miniplayer-off");
    const packed = packMod(directory);
    const loaded = loadPackedMod(packed.archive);
    const extracted: unknown[] = [];
    const clicks: string[] = [];
    const dom = new JSDOM(`
      <ytd-miniplayer>
        <div class="miniplayer-scrim">Now playing HTML</div>
        <button class="ytp-miniplayer-close-button" type="button">Close</button>
      </ytd-miniplayer>
      <div id="miniplayer">Docked player HTML</div>
      <video class="html5-main-video"></video>
    `);
    dom.window.document
      .querySelector(".ytp-miniplayer-close-button")
      ?.addEventListener("click", () => {
        clicks.push("close");
      });
    const handlers = createContentHandlers(dom.window.document);
    const originalExtract = handlers.extract;
    const states = await loadNativeMods(
      [
        {
          manifest: loaded.manifest,
          files: loaded.files,
          activate: activateYoutubeMiniplayerOff,
        },
      ],
      {
        url: "https://www.youtube.com/watch?v=fixture",
        tabId: 1,
        grantsByMod: {
          [loaded.manifest.id]: ["youtube.watch.constrainMiniplayer"],
        },
        handlers: {
          ...handlers,
          extract: async (capability, input, manifest) => {
            const result = await originalExtract?.(capability, input, manifest);
            extracted.push(result);
            return result;
          },
        },
      },
    );
    expect(states[0]?.status).toBe("active");
    expect(clicks).toEqual(["close"]);
    expect(extracted[0]).toEqual({
      constrained: true,
      kind: "miniplayer",
    });
    expect(JSON.stringify(extracted[0])).not.toMatch(/</u);
    expect(dom.window.document.querySelector("ytd-miniplayer")?.hidden).toBe(
      true,
    );
    expect(dom.window.document.querySelector("#miniplayer")?.hidden).toBe(true);
  });

  test("sponsorblock-segments extract returns JSON skip times from a fixture", async () => {
    const directory = corpusDir("userscripts/sponsorblock-segments");
    const packed = packMod(directory);
    const loaded = loadPackedMod(packed.archive);
    const fixture = readFileSync(
      join(directory, "fixtures", "skip-segments.json"),
      "utf8",
    );
    const extracted: unknown[] = [];
    const requestSponsorSegments = vi.fn(async (message: {
      readonly videoId: string;
    }) => {
      expect(message.videoId).toBe("fixture-video-id");
      return parseSponsorSegments(fixture);
    });
    const dom = new JSDOM(
      `<main><video class="html5-main-video"></video></main>`,
      {
        url: "https://www.youtube.com/watch?v=fixture-video-id",
      },
    );
    const handlers = createContentHandlers(
      dom.window.document,
      undefined,
      undefined,
      undefined,
      requestSponsorSegments,
    );
    const originalExtract = handlers.extract;
    const states = await loadNativeMods(
      [
        {
          manifest: loaded.manifest,
          files: loaded.files,
          activate: activateSponsorblock,
        },
      ],
      {
        url: "https://www.youtube.com/watch?v=fixture-video-id",
        tabId: 1,
        grantsByMod: {
          [loaded.manifest.id]: [
            "youtube.watch.videoId",
            "youtube.watch.sponsorSegments",
          ],
        },
        handlers: {
          ...handlers,
          extract: async (capability, input, manifest) => {
            const result = await originalExtract?.(capability, input, manifest);
            extracted.push(result);
            return result;
          },
        },
      },
    );
    expect(states[0]?.status).toBe("active");
    expect(requestSponsorSegments).toHaveBeenCalledTimes(1);
    expect(extracted[1]).toEqual({
      segments: [
        {
          category: "sponsor",
          actionType: "skip",
          start: 1.5,
          end: 12,
        },
        {
          category: "intro",
          actionType: "skip",
          start: 12,
          end: 18.25,
        },
      ],
    });
    expect(JSON.stringify(extracted[1])).not.toMatch(/</u);
    expect(JSON.stringify(extracted[1])).not.toContain("UUID");
    const video = dom.window.document.querySelector("video");
    expect(video).not.toBeNull();
    video!.currentTime = 2;
    video!.dispatchEvent(new dom.window.Event("timeupdate"));
    expect(video!.currentTime).toBe(12);
  });

  test("service worker fetches SponsorBlock only for a granted mod", async () => {
    const directory = corpusDir("userscripts/sponsorblock-segments");
    const manifest = packMod(directory).manifest;
    const fixture = readFileSync(
      join(directory, "fixtures", "skip-segments.json"),
      "utf8",
    );
    const fetchSponsorSegmentsJson = vi.fn().mockResolvedValue(fixture);
    const dependencies: ServiceWorkerDependencies = {
      getState: vi.fn().mockResolvedValue({
        enabled: {},
        grants: {
          [manifest.id]: [
            "youtube.watch.videoId",
            "youtube.watch.sponsorSegments",
          ],
        },
      }),
      setState: vi.fn(),
      sendToTab: vi.fn(),
      reloadTab: vi.fn(),
      queryTabs: vi.fn().mockResolvedValue([]),
      syncBrowserRules: vi.fn(),
      fetchSponsorSegmentsJson,
    };
    const mods = Promise.resolve([{ manifest, entry: null }]);
    const authentication = {
      extensionId: "fixture-extension",
      popupUrl: "chrome-extension://fixture-extension/popup.html",
    };

    await expect(
      handleRuntimeMessage(
        {
          type: "youtube-watch-sponsor-segments",
          modId: manifest.id,
          videoId: "fixture-video-id",
        },
        {
          id: "fixture-extension",
          url: "https://www.youtube.com/watch?v=fixture-video-id",
          tab: { id: 1 },
        },
        mods,
        dependencies,
        authentication,
      ),
    ).resolves.toEqual({
      segments: expect.arrayContaining([
        expect.objectContaining({ category: "sponsor", start: 1.5 }),
      ]),
    });
    expect(fetchSponsorSegmentsJson).toHaveBeenCalledWith("fixture-video-id");

    fetchSponsorSegmentsJson.mockClear();
    await expect(
      handleRuntimeMessage(
        {
          type: "youtube-watch-sponsor-segments",
          modId: manifest.id,
          videoId: "fixture-video-id",
        },
        {
          id: "fixture-extension",
          url: "https://www.youtube.com/watch?v=fixture-video-id",
          tab: { id: 1 },
        },
        mods,
        {
          ...dependencies,
          getState: vi.fn().mockResolvedValue({
            enabled: {},
            grants: { [manifest.id]: ["youtube.watch.videoId"] },
          }),
        },
        authentication,
      ),
    ).resolves.toEqual({ status: 403, error: "SponsorBlock search denied" });
    expect(fetchSponsorSegmentsJson).not.toHaveBeenCalled();
  });

  test("search-direct-links extract unwraps fixture redirects without HTML", async () => {
    const directory = corpusDir("userscripts/search-direct-links");
    const packed = packMod(directory);
    const loaded = loadPackedMod(packed.archive);
    const fixture = readFileSync(
      join(directory, "fixtures", "search-results.html"),
      "utf8",
    );
    const extracted: unknown[] = [];
    const dom = new JSDOM(fixture, {
      url: "https://www.google.com/search?q=example",
    });
    const handlers = createContentHandlers(dom.window.document);
    const originalExtract = handlers.extract;
    const states = await loadNativeMods(
      [
        {
          manifest: loaded.manifest,
          files: loaded.files,
          activate: activateSearchDirectLinks,
        },
      ],
      {
        url: "https://www.google.com/search?q=example",
        tabId: 1,
        grantsByMod: {
          [loaded.manifest.id]: ["search.results.directLinks"],
        },
        handlers: {
          ...handlers,
          extract: async (capability, input, manifest) => {
            const result = await originalExtract?.(capability, input, manifest);
            extracted.push(result);
            return result;
          },
        },
      },
    );
    expect(states[0]?.status).toBe("active");
    expect(extracted[0]).toEqual({
      links: [
        {
          id: "result-docs",
          href: "https://docs.example.com/guide",
          title: "Example Docs",
        },
        {
          id: "result-news",
          href: "https://news.example.org/story",
          title: "Example News",
        },
      ],
    });
    expect(JSON.stringify(extracted[0])).not.toMatch(/</u);
    expect(dom.window.document.querySelector("#result-docs")?.getAttribute("href")).toBe(
      "https://docs.example.com/guide",
    );
  });

  test("youtube-adb replaces first-party YouTube slots without HTML or fetch", async () => {
    const directory = corpusDir("userscripts/youtube-adb");
    const packed = packMod(directory);
    const loaded = loadPackedMod(packed.archive);
    const extracted: unknown[] = [];
    const dom = new JSDOM(
      `
      <ytd-ad-slot-renderer>Sponsored in-feed HTML</ytd-ad-slot-renderer>
      <ytd-display-ad-renderer>Display advert HTML</ytd-display-ad-renderer>
      <ytd-player-legacy-desktop-watch-ads-renderer>Watch companion HTML</ytd-player-legacy-desktop-watch-ads-renderer>
      <div class="ytp-ad-player-overlay">Skip advert overlay</div>
      <ytd-rich-item-renderer>Normal video</ytd-rich-item-renderer>
    `,
      { url: "https://www.youtube.com/watch?v=fixture" },
    );
    const handlers = createContentHandlers(dom.window.document);
    const originalExtract = handlers.extract;
    const states = await loadNativeMods(
      [
        {
          manifest: loaded.manifest,
          files: loaded.files,
          activate: activateYoutubeAdb,
        },
      ],
      {
        url: "https://www.youtube.com/watch?v=fixture",
        tabId: 1,
        grantsByMod: {
          [loaded.manifest.id]: [
            "visual.ad-slot.replace",
            "visual.hide",
          ],
        },
        handlers: {
          ...handlers,
          extract: async (capability, input, manifest) => {
            const result = await originalExtract?.(capability, input, manifest);
            extracted.push(result);
            return result;
          },
        },
      },
    );
    expect(states[0]?.status).toBe("active");
    expect(extracted[0]).toEqual([
      { id: "live:ytd-ad-slot-renderer:0" },
      { id: "live:ytd-display-ad-renderer:0" },
      { id: "live:ytd-player-legacy-desktop-watch-ads-renderer:0" },
      { id: "live:ytp-ad-player-overlay:0" },
    ]);
    expect(JSON.stringify(extracted[0])).not.toMatch(/</u);
    const inFeed = dom.window.document.querySelector("ytd-ad-slot-renderer");
    const display = dom.window.document.querySelector("ytd-display-ad-renderer");
    expect(inFeed?.textContent).toBe("Advert slot hidden");
    expect(display?.textContent).toBe("Advert slot hidden");
    expect(inFeed?.querySelector("[data-prism-owned]")?.textContent).toBe(
      "Advert slot hidden",
    );
    expect(
      dom.window.document.querySelector("ytd-rich-item-renderer")?.textContent,
    ).toBe("Normal video");
    expect(inFeed?.textContent).not.toContain("Sponsored");
    expect(
      dom.window.document.querySelector(
        "ytd-player-legacy-desktop-watch-ads-renderer",
      )?.textContent,
    ).toBe("Advert slot hidden");
    expect(
      dom.window.document.querySelector(".ytp-ad-player-overlay")?.textContent,
    ).toBe("Advert slot hidden");
  });

  test("reddit-plus-plus hides keyword posts from JSON titles, not HTML", async () => {
    const directory = corpusDir("userscripts/reddit-plus-plus");
    const packed = packMod(directory);
    const loaded = loadPackedMod(packed.archive);
    const extracted: unknown[] = [];
    const dom = new JSDOM(
      `
      <article class="promotedlink">Promoted CSS unit</article>
      <shreddit-post>
        <a slot="title">Buy crypto dump today</a>
      </shreddit-post>
      <shreddit-post>
        <a slot="title">Weekend hiking thread</a>
      </shreddit-post>
    `,
      { url: "https://www.reddit.com/r/all/" },
    );
    const handlers = createContentHandlers(dom.window.document);
    const originalExtract = handlers.extract;
    const states = await loadNativeMods(
      [
        {
          manifest: loaded.manifest,
          files: loaded.files,
          activate: activateRedditPlusPlus,
        },
      ],
      {
        url: "https://www.reddit.com/r/all/",
        tabId: 1,
        grantsByMod: {
          [loaded.manifest.id]: ["visual.hide", "reddit.feed.posts"],
        },
        handlers: {
          ...handlers,
          extract: async (capability, input, manifest) => {
            const result = await originalExtract?.(capability, input, manifest);
            extracted.push({ capability, result });
            return result;
          },
        },
      },
    );
    expect(states[0]?.status).toBe("active");
    expect(extracted).toEqual([
      {
        capability: "reddit.feed.posts",
        result: {
          posts: [
            { id: "live:shreddit-post:0", title: "Buy crypto dump today" },
            { id: "live:shreddit-post:1", title: "Weekend hiking thread" },
          ],
        },
      },
    ]);
    expect(JSON.stringify(extracted)).not.toMatch(/</u);
    expect(
      dom.window.document.querySelector(
        '[data-prism-feed-item="live:shreddit-post:0"]',
      )?.textContent,
    ).toContain("Buy crypto dump today");
    const injected = Array.from(
      dom.window.document.querySelectorAll("style[data-prism-owned]"),
    )
      .map((style) => style.textContent ?? "")
      .join("\n");
    expect(injected).toContain('[data-prism-feed-item="live:shreddit-post:0"]');
    expect(injected).not.toContain("live:shreddit-post:1");
    expect(
      injected.includes("promotedlink") || injected.includes("shreddit-ad"),
    ).toBe(true);
  });
});
