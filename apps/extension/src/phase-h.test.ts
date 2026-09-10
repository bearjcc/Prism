import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { loadUnpackedMod, type PrismApi } from "@prism/schema";
import { afterEach, describe, expect, test, vi } from "vitest";
import { activate as activateFacebookHomeMod } from "../../../mods/facebook-home-friends/src/index.js";
import {
  activateContentMods,
  createContentHandlers,
  pageNeedsSurfaceRefresh,
  readFacebookHomeDegradation,
  resetFacebookHomeDegradationForTests,
} from "./content-script.js";
import { findFacebookHomeFeed } from "./extractors/facebook-home.js";
import { createPrismApi, TabUndoStack } from "./prism-api.js";

const facebookModRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "mods",
  "facebook-home-friends",
);

function findHomeFeed(document: Document): Element | null {
  return findFacebookHomeFeed(document) ?? null;
}

describe("Phase H Facebook Home tracer", () => {
  afterEach(() => {
    resetFacebookHomeDegradationForTests();
  });

  test("the mod only requests the friends-only Home allowlist", async () => {
    const allowlist = vi.fn();
    const prism: PrismApi = {
      slots: { replace: vi.fn() },
      styles: { apply: vi.fn() },
      ui: { allowlist },
      extract: vi.fn(),
      net: { request: vi.fn() },
    };

    await activateFacebookHomeMod(prism);

    expect(allowlist).toHaveBeenCalledOnce();
    expect(allowlist).toHaveBeenCalledWith("facebook.home", "post");
    expect(prism.extract).not.toHaveBeenCalled();
    expect(prism.styles.apply).not.toHaveBeenCalled();
    expect(prism.slots.replace).not.toHaveBeenCalled();
    expect(prism.net.request).not.toHaveBeenCalled();
  });

  test("allowlist keeps friend posts on Home", async () => {
    const fixture = readFileSync(
      join(facebookModRoot, "fixtures", "feed.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.facebook.com/" });
    const stray = dom.window.document.createElement("div");
    stray.setAttribute("role", "article");
    stray.setAttribute("data-fixture-kind", "stray");
    stray.textContent = "Stray outside feed";
    dom.window.document.body.append(stray);

    const manifest = loadUnpackedMod(facebookModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["facebook.home.allowlist"],
      tabId: 7,
      handlers: createContentHandlers(dom.window.document),
    });

    await activateFacebookHomeMod(prism);

    const feed = findHomeFeed(dom.window.document);
    expect(
      feed?.querySelectorAll('[data-prism-owned="facebook-home-kept"]'),
    ).toHaveLength(1);
    expect(
      feed?.querySelectorAll('[data-prism-owned="facebook-home-hidden"]'),
    ).toHaveLength(0);
    expect(
      feed?.querySelectorAll("[data-fixture-kind='sponsored']"),
    ).toHaveLength(0);
    expect(
      feed?.querySelectorAll("[data-fixture-kind='suggested']"),
    ).toHaveLength(0);
    expect(
      feed?.querySelectorAll("[data-fixture-kind='page']"),
    ).toHaveLength(0);
    expect(
      feed?.querySelectorAll("[data-fixture-kind='group']"),
    ).toHaveLength(0);
    expect(
      feed?.querySelectorAll("[data-fixture-kind='activity-reshare']"),
    ).toHaveLength(0);
    expect(
      feed?.querySelectorAll("[data-fixture-kind='module']"),
    ).toHaveLength(0);
    expect(
      dom.window.document.querySelector("[data-fixture-kind='stray']"),
    ).toBe(stray);
  });

  test("allowlist does not activate on non-Home Facebook URLs", async () => {
    const fixture = readFileSync(
      join(facebookModRoot, "fixtures", "feed.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, {
      url: "https://www.facebook.com/messages",
    });
    const manifest = loadUnpackedMod(facebookModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["facebook.home.allowlist"],
      tabId: 7,
      handlers: createContentHandlers(dom.window.document),
    });

    await activateFacebookHomeMod(prism);

    expect(
      dom.window.document.querySelector('[data-prism-owned="facebook-home-kept"]'),
    ).toBeNull();
    expect(
      dom.window.document.querySelectorAll("[data-fixture-kind]").length,
    ).toBeGreaterThan(0);
  });

  test("allowlist never throws through the Prism API on broken feed children", async () => {
    const fixture = readFileSync(
      join(facebookModRoot, "fixtures", "feed-live.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.facebook.com/" });
    const feed = findHomeFeed(dom.window.document);
    const broken = dom.window.document.createElement("div");
    broken.setAttribute("role", "article");
    broken.innerHTML = "<p>Broken child</p>";
    broken.replaceWith = () => {
      throw new DOMException("replace blocked");
    };
    broken.remove = () => {
      throw new DOMException("remove blocked");
    };
    feed?.append(broken);

    const manifest = loadUnpackedMod(facebookModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["facebook.home.allowlist"],
      tabId: 7,
      handlers: createContentHandlers(dom.window.document),
    });

    expect(() => {
      prism.ui.allowlist("facebook.home", "post");
    }).not.toThrow();
    expect(
      feed?.querySelectorAll('[data-prism-owned="facebook-home-kept"]'),
    ).toHaveLength(1);
    expect(
      broken.getAttribute("data-prism-owned") === "facebook-home-hidden" ||
        broken.parentNode === null,
    ).toBe(true);
  });

  test("records degradation when the feed is missing without throwing", async () => {
    const dom = new JSDOM("", { url: "https://www.facebook.com/" });
    const manifest = loadUnpackedMod(facebookModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["facebook.home.allowlist"],
      tabId: 7,
      handlers: createContentHandlers(dom.window.document),
    });

    expect(() => {
      prism.ui.allowlist("facebook.home", "post");
    }).not.toThrow();
    expect(readFacebookHomeDegradation()).toMatch(
      /facebook\.home\.allowlist degraded: feed not found/iu,
    );
  });

  test("waits for a late Home feed before activating the allowlist", async () => {
    const dom = new JSDOM("", { url: "https://www.facebook.com/" });
    const facebookManifest = loadUnpackedMod(facebookModRoot).manifest;
    const loadEntry = vi.fn().mockResolvedValue({
      activate: activateFacebookHomeMod,
    });
    const activation = activateContentMods({
      url: dom.window.location.href,
      requestActiveMods: vi.fn().mockResolvedValue({
        mods: [
          {
            manifest: facebookManifest,
            entry: "bundled-mods/prism.facebook-home-friends/src/index.js",
            grants: ["facebook.home.allowlist"],
          },
        ],
      }),
      loadEntry,
      handlers: createContentHandlers(dom.window.document),
      undo: new TabUndoStack(),
      contentDocument: dom.window.document,
      facebookHomeWaitMs: 100,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadEntry).not.toHaveBeenCalled();

    const fixture = new JSDOM(
      readFileSync(join(facebookModRoot, "fixtures", "feed.html"), "utf8"),
    );
    dom.window.document.body.append(
      fixture.window.document.querySelector("main")!,
    );

    const states = await activation;
    expect(states).toEqual([
      { id: "prism.facebook-home-friends", status: "active" },
    ]);
    expect(loadEntry).toHaveBeenCalledOnce();
    expect(
      dom.window.document.querySelectorAll(
        '[data-prism-owned="facebook-home-kept"]',
      ),
    ).toHaveLength(1);
  });

  test("pageNeedsSurfaceRefresh is true when the feed has unowned children", () => {
    const fixture = readFileSync(
      join(facebookModRoot, "fixtures", "feed.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.facebook.com/" });
    expect(pageNeedsSurfaceRefresh(dom.window.document)).toBe(true);
  });

  test("pageNeedsSurfaceRefresh is true after a late feed child is inserted", async () => {
    const fixture = readFileSync(
      join(facebookModRoot, "fixtures", "feed.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.facebook.com/" });
    const manifest = loadUnpackedMod(facebookModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["facebook.home.allowlist"],
      tabId: 7,
      handlers: createContentHandlers(dom.window.document),
    });

    await activateFacebookHomeMod(prism);
    expect(pageNeedsSurfaceRefresh(dom.window.document)).toBe(false);

    const feed = findHomeFeed(dom.window.document);
    const late = dom.window.document.createElement("div");
    late.setAttribute("role", "article");
    late.setAttribute("data-fixture-kind", "sponsored");
    late.innerHTML = `
      <div class="fb-feed-author">
        <span class="fb-author-name">Late Sponsor</span>
        <span class="fb-sponsored-label">Sponsored</span>
      </div>
    `;
    feed?.append(late);

    expect(pageNeedsSurfaceRefresh(dom.window.document)).toBe(true);

    prism.ui.allowlist("facebook.home", "post");
    expect(late.parentNode).toBeNull();
  });
});
