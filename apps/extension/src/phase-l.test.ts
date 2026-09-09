import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { loadUnpackedMod, type PrismApi } from "@prism/schema";
import { afterEach, describe, expect, test, vi } from "vitest";
import { activate as activateLinkedinHomeMod } from "../../../mods/linkedin-home-first-degree/src/index.js";
import {
  activateContentMods,
  createContentHandlers,
  pageNeedsSurfaceRefresh,
  readLinkedinHomeDegradation,
  resetLinkedinHomeDegradationForTests,
} from "./content-script.js";
import { findLinkedinHomeFeed } from "./extractors/linkedin-home.js";
import { createPrismApi, TabUndoStack } from "./prism-api.js";

const linkedinModRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "mods",
  "linkedin-home-first-degree",
);

function findHomeFeed(document: Document): Element | null {
  return findLinkedinHomeFeed(document) ?? null;
}

describe("Phase L LinkedIn Home tracer", () => {
  afterEach(() => {
    resetLinkedinHomeDegradationForTests();
  });

  test("the mod only requests the first-degree Home allowlist", async () => {
    const allowlist = vi.fn();
    const prism: PrismApi = {
      slots: { replace: vi.fn() },
      styles: { apply: vi.fn() },
      ui: { allowlist },
      extract: vi.fn(),
      net: { request: vi.fn() },
    };

    await activateLinkedinHomeMod(prism);

    expect(allowlist).toHaveBeenCalledOnce();
    expect(allowlist).toHaveBeenCalledWith("linkedin.home", "post");
    expect(prism.extract).not.toHaveBeenCalled();
    expect(prism.styles.apply).not.toHaveBeenCalled();
    expect(prism.slots.replace).not.toHaveBeenCalled();
    expect(prism.net.request).not.toHaveBeenCalled();
  });

  test("allowlist keeps first-degree and followed-page posts on /feed", async () => {
    const fixture = readFileSync(
      join(linkedinModRoot, "fixtures", "feed.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.linkedin.com/feed" });
    const stray = dom.window.document.createElement("div");
    stray.setAttribute("data-view-name", "feed-full-update");
    stray.setAttribute("data-fixture-kind", "stray");
    stray.textContent = "Stray outside feed";
    dom.window.document.body.append(stray);

    const manifest = loadUnpackedMod(linkedinModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["linkedin.home.allowlist"],
      tabId: 7,
      handlers: createContentHandlers(dom.window.document),
    });

    await activateLinkedinHomeMod(prism);

    const feed = findHomeFeed(dom.window.document);
    expect(
      feed?.querySelectorAll('[data-prism-owned="linkedin-home-kept"]'),
    ).toHaveLength(2);
    expect(
      feed?.querySelectorAll('[data-prism-owned="linkedin-home-hidden"]'),
    ).toHaveLength(0);
    expect(
      feed?.querySelectorAll("[data-fixture-kind='second-degree']"),
    ).toHaveLength(0);
    expect(
      feed?.querySelectorAll("[data-fixture-kind='promoted']"),
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

  test("allowlist does not activate on non-feed LinkedIn URLs", async () => {
    const fixture = readFileSync(
      join(linkedinModRoot, "fixtures", "feed.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, {
      url: "https://www.linkedin.com/in/me",
    });
    const manifest = loadUnpackedMod(linkedinModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["linkedin.home.allowlist"],
      tabId: 7,
      handlers: createContentHandlers(dom.window.document),
    });

    await activateLinkedinHomeMod(prism);

    expect(
      dom.window.document.querySelector('[data-prism-owned="linkedin-home-kept"]'),
    ).toBeNull();
    expect(
      dom.window.document.querySelectorAll("[data-fixture-kind]").length,
    ).toBeGreaterThan(0);
  });

  test("allowlist never throws through the Prism API on broken feed children", async () => {
    const fixture = readFileSync(
      join(linkedinModRoot, "fixtures", "feed-live.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.linkedin.com/feed" });
    const feed = findHomeFeed(dom.window.document);
    const broken = dom.window.document.createElement("div");
    broken.setAttribute("data-view-name", "feed-full-update");
    broken.innerHTML = "<p>Broken child</p>";
    broken.replaceWith = () => {
      throw new DOMException("replace blocked");
    };
    broken.remove = () => {
      throw new DOMException("remove blocked");
    };
    feed?.append(broken);

    const manifest = loadUnpackedMod(linkedinModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["linkedin.home.allowlist"],
      tabId: 7,
      handlers: createContentHandlers(dom.window.document),
    });

    expect(() => {
      prism.ui.allowlist("linkedin.home", "post");
    }).not.toThrow();
    expect(
      feed?.querySelectorAll('[data-prism-owned="linkedin-home-kept"]'),
    ).toHaveLength(2);
    expect(
      broken.getAttribute("data-prism-owned") === "linkedin-home-hidden" ||
        broken.parentNode === null,
    ).toBe(true);
  });

  test("records degradation when the feed is missing without throwing", async () => {
    const dom = new JSDOM("", { url: "https://www.linkedin.com/feed" });
    const manifest = loadUnpackedMod(linkedinModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["linkedin.home.allowlist"],
      tabId: 7,
      handlers: createContentHandlers(dom.window.document),
    });

    expect(() => {
      prism.ui.allowlist("linkedin.home", "post");
    }).not.toThrow();
    expect(readLinkedinHomeDegradation()).toMatch(
      /linkedin\.home\.allowlist degraded: feed not found/iu,
    );
  });

  test("waits for a late Home feed before activating the allowlist", async () => {
    const dom = new JSDOM("", { url: "https://www.linkedin.com/feed" });
    const linkedinManifest = loadUnpackedMod(linkedinModRoot).manifest;
    const loadEntry = vi.fn().mockResolvedValue({
      activate: activateLinkedinHomeMod,
    });
    const activation = activateContentMods({
      url: dom.window.location.href,
      requestActiveMods: vi.fn().mockResolvedValue({
        mods: [
          {
            manifest: linkedinManifest,
            entry: "bundled-mods/prism.linkedin-home-first-degree/src/index.js",
            grants: ["linkedin.home.allowlist"],
          },
        ],
      }),
      loadEntry,
      handlers: createContentHandlers(dom.window.document),
      undo: new TabUndoStack(),
      contentDocument: dom.window.document,
      linkedinHomeWaitMs: 100,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadEntry).not.toHaveBeenCalled();

    const fixture = new JSDOM(
      readFileSync(join(linkedinModRoot, "fixtures", "feed.html"), "utf8"),
    );
    dom.window.document.body.append(
      fixture.window.document.querySelector("main")!,
    );

    const states = await activation;
    expect(states).toEqual([
      { id: "prism.linkedin-home-first-degree", status: "active" },
    ]);
    expect(loadEntry).toHaveBeenCalledOnce();
    expect(
      dom.window.document.querySelectorAll(
        '[data-prism-owned="linkedin-home-kept"]',
      ),
    ).toHaveLength(2);
  });

  test("pageNeedsSurfaceRefresh is true when the feed has unowned children", () => {
    const fixture = readFileSync(
      join(linkedinModRoot, "fixtures", "feed.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.linkedin.com/feed" });
    expect(pageNeedsSurfaceRefresh(dom.window.document)).toBe(true);
  });

  test("pageNeedsSurfaceRefresh is true after a late feed child is inserted", async () => {
    const fixture = readFileSync(
      join(linkedinModRoot, "fixtures", "feed.html"),
      "utf8",
    );
    const dom = new JSDOM(fixture, { url: "https://www.linkedin.com/feed" });
    const manifest = loadUnpackedMod(linkedinModRoot).manifest;
    const prism = createPrismApi({
      manifest,
      grants: ["linkedin.home.allowlist"],
      tabId: 7,
      handlers: createContentHandlers(dom.window.document),
    });

    await activateLinkedinHomeMod(prism);
    expect(pageNeedsSurfaceRefresh(dom.window.document)).toBe(false);

    const feed = findHomeFeed(dom.window.document);
    const late = dom.window.document.createElement("div");
    late.setAttribute("data-view-name", "feed-full-update");
    late.setAttribute("data-fixture-kind", "second-degree");
    late.innerHTML = `
      <div class="update-components-actor">
        <span class="update-components-actor__name">Late Network</span>
        <span class="update-components-actor__supplementary-actor-info">2nd</span>
      </div>
    `;
    feed?.append(late);

    expect(pageNeedsSurfaceRefresh(dom.window.document)).toBe(true);

    prism.ui.allowlist("linkedin.home", "post");
    expect(late.parentNode).toBeNull();
  });
});
