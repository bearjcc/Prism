import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import {
  CAPABILITY_REGISTRY,
  loadPackedMod,
  loadUnpackedMod,
  packMod,
} from "@prism/schema";
import { describe, expect, test, vi } from "vitest";
import { extractAdSlots } from "./extractors/ad-slot.js";
import { parseRedditComments } from "./extractors/reddit-comments.js";
import { extractYoutubeHome } from "./extractors/youtube-home.js";
import { extractYoutubeWatch } from "./extractors/youtube-watch.js";
import {
  describeModHostAccess,
  describeOptionalCapability,
  mountPopup,
} from "./popup.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const modsRoot = join(repoRoot, "mods");
const TRACER_MODS = [
  "kitten-ad-replace",
  "youtube-home-videos",
  "youtube-reddit-comments",
] as const;
const FORBIDDEN_MOD_PRIMITIVES = /\b(?:eval|fetch)\b|innerHTML/u;

function packedTracerSource(directory: string): string {
  const packed = packMod(join(modsRoot, directory));
  return new TextDecoder().decode(
    loadPackedMod(packed.archive).files["src/index.js"] ?? new Uint8Array(),
  );
}

function schemaKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (typeof value !== "object" || value === null) {
    return keys;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      schemaKeys(entry, keys);
    }
    return keys;
  }
  for (const [key, entry] of Object.entries(value)) {
    keys.add(key);
    schemaKeys(entry, keys);
  }
  return keys;
}

function jsonLeavesHaveNoHtml(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      jsonLeavesHaveNoHtml(entry, `${path}[${index}]`);
    });
    return;
  }
  if (typeof value === "object" && value !== null) {
    expect(value, path).not.toHaveProperty("html");
    expect(value, path).not.toHaveProperty("innerHTML");
    for (const [key, entry] of Object.entries(value)) {
      jsonLeavesHaveNoHtml(entry, `${path}.${key}`);
    }
  }
}

describe("Phase G hardening", () => {
  test.each([...TRACER_MODS])(
    "packed %s JS has no eval, page fetch, or innerHTML",
    (directory) => {
      const source = packedTracerSource(directory);
      expect(source.length).toBeGreaterThan(0);
      expect(source).not.toMatch(FORBIDDEN_MOD_PRIMITIVES);
    },
  );

  test("extractor JSON schemas never expose HTML fields", () => {
    const keys = schemaKeys(CAPABILITY_REGISTRY);
    expect(keys.has("html")).toBe(false);
    expect(keys.has("innerHTML")).toBe(false);
  });

  test("extractor outputs are JSON handles and never HTML strings", () => {
    const adDom = new JSDOM(
      `<aside data-prism-ad-slot="sidebar"><b>Buy</b></aside>`,
    );
    const homeDom = new JSDOM(
      readFileSync(
        join(modsRoot, "youtube-home-videos", "fixtures", "home.html"),
        "utf8",
      ),
      { url: "https://www.youtube.com/" },
    );
    const redditHtml = readFileSync(
      join(
        modsRoot,
        "youtube-reddit-comments",
        "fixtures",
        "reddit-search.html",
      ),
      "utf8",
    );
    const adSlots = extractAdSlots(adDom.window.document);
    const home = extractYoutubeHome(homeDom.window.document);
    const watch = extractYoutubeWatch(
      "https://www.youtube.com/watch?v=fixture-video-id",
    );
    const comments = parseRedditComments(redditHtml, (html) => {
      return new JSDOM(html).window.document;
    });

    jsonLeavesHaveNoHtml(adSlots);
    jsonLeavesHaveNoHtml(home);
    jsonLeavesHaveNoHtml(watch);
    jsonLeavesHaveNoHtml(comments);
    expect(JSON.stringify(adSlots)).not.toMatch(/</u);
    expect(JSON.stringify(comments)).not.toContain("data-testid");
  });

  test("content script never assigns extractor output through innerHTML", () => {
    const source = readFileSync(
      join(import.meta.dirname, "content-script.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/innerHTML/u);
  });
});

describe("Phase G popup disclosure", () => {
  test("explains why Reddit comments need a host grant", () => {
    const text = describeOptionalCapability("reddit.comments.search");
    expect(text).toMatch(/reddit\.com/iu);
    expect(text).toMatch(/JSON/u);
    expect(text).toMatch(/HTML/u);
  });

  test("explains why kitten replacement runs on all sites", () => {
    const manifest = loadUnpackedMod(
      join(modsRoot, "kitten-ad-replace"),
    ).manifest;
    const text = describeModHostAccess(manifest);
    expect(text).toMatch(/all sites|every site/iu);
    expect(text).toMatch(/slot/iu);
  });

  test("renders disclosure copy in the popup", async () => {
    const kitten = loadUnpackedMod(join(modsRoot, "kitten-ad-replace"));
    const reddit = loadUnpackedMod(join(modsRoot, "youtube-reddit-comments"));
    const sendMessage = vi.fn().mockResolvedValue([
      {
        manifest: kitten.manifest,
        enabled: true,
        grants: kitten.manifest.capabilities.required,
      },
      {
        manifest: reddit.manifest,
        enabled: true,
        grants: reddit.manifest.capabilities.required,
      },
    ]);
    const dom = new JSDOM(`<!doctype html><main id="mods"></main>
      <button id="undo" type="button">Undo</button>`);
    await mountPopup(
      {
        runtime: { sendMessage },
        permissions: { request: vi.fn() },
        tabs: { query: vi.fn().mockResolvedValue([]) },
      },
      dom.window.document,
    );

    const body = dom.window.document.body.textContent ?? "";
    expect(body).toContain(
      describeOptionalCapability("reddit.comments.search"),
    );
    expect(body).toContain(describeModHostAccess(kitten.manifest));
  });
});

describe("Phase G docs", () => {
  test("README covers load unpacked, optional caps, and known breakage", () => {
    const readme = readFileSync(
      join(repoRoot, "apps", "extension", "README.md"),
      "utf8",
    );
    expect(readme).toContain("targets/chrome");
    expect(readme).toMatch(/Load unpacked/iu);
    expect(readme).toContain("npm run build");
    expect(readme).toContain("reddit.comments.search");
    expect(readme).toContain("network.egress");
    expect(readme).toContain("network.browser.block");
    expect(readme).toMatch(/bot wall/iu);
    expect(readme).toContain("videoId");
    expect(readme).toContain('credentials: "omit"');
    expect(readme).toContain("visual.ad-slot.replace");
    expect(readme).toMatch(/adapter/iu);
    expect(readme).toMatch(/desktop/iu);
    expect(readme).toContain("kitten-ad-replace");
    expect(readme).toContain("youtube-home-videos");
    expect(readme).toContain("youtube-reddit-comments");
  });
});
