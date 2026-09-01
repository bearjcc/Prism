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
import { parseSponsorSegments } from "./extractors/sponsor-segments.js";
import { extractYoutubeHome } from "./extractors/youtube-home.js";
import { extractYoutubeWatch, extractYoutubeIdlePrompt, constrainYoutubeAutoplay } from "./extractors/youtube-watch.js";
import {
  describeActivityEvent,
  describeModHostAccess,
  describeModKind,
  describeOptionalCapability,
  describePastePolicy,
  describePastePolicyDefault,
  describePopupSuppressPolicyDefault,
  describeScrollLockPolicyDefault,
  describeTitleFreezePolicyDefault,
  describeOverlaySuppressPolicyDefault,
  describeConsentRejectPolicyDefault,
  describeAutoplayPolicyDefault,
  importPackedArchive,
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
    const idle = extractYoutubeIdlePrompt(
      new JSDOM(
        `<yt-confirm-dialog-renderer><p>Continue watching?</p></yt-confirm-dialog-renderer>`,
      ).window.document,
    );
    const autoplay = constrainYoutubeAutoplay(
      new JSDOM(
        `<button class="ytp-autonav-toggle-button" aria-checked="true" type="button">Autoplay</button><video class="html5-main-video" autoplay></video>`,
      ).window.document,
    );
    const sponsor = parseSponsorSegments(
      readFileSync(
        join(
          repoRoot,
          "corpus",
          "userscripts",
          "sponsorblock-segments",
          "fixtures",
          "skip-segments.json",
        ),
        "utf8",
      ),
    );

    jsonLeavesHaveNoHtml(adSlots);
    jsonLeavesHaveNoHtml(home);
    jsonLeavesHaveNoHtml(watch);
    jsonLeavesHaveNoHtml(comments);
    jsonLeavesHaveNoHtml(idle);
    jsonLeavesHaveNoHtml(autoplay);
    jsonLeavesHaveNoHtml(sponsor);
    expect(JSON.stringify(adSlots)).not.toMatch(/</u);
    expect(JSON.stringify(comments)).not.toContain("data-testid");
    expect(JSON.stringify(idle)).not.toMatch(/</u);
    expect(JSON.stringify(autoplay)).not.toMatch(/</u);
    expect(JSON.stringify(sponsor)).not.toContain("UUID");
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

  test("explains why SponsorBlock skip times need a host grant", () => {
    const text = describeOptionalCapability("youtube.watch.sponsorSegments");
    expect(text).toMatch(/sponsor\.ajay\.app/iu);
    expect(text).toMatch(/JSON/u);
    expect(text).toMatch(/seek/iu);
  });

  test("explains why kitten replacement runs on all sites", () => {
    const manifest = loadUnpackedMod(
      join(modsRoot, "kitten-ad-replace"),
    ).manifest;
    const text = describeModHostAccess(manifest);
    expect(text).toMatch(/all sites|every site/iu);
    expect(text).toMatch(/slot/iu);
  });

  test("labels css, declarative, and userscript mods", () => {
    expect(describeModKind("css")).toBe("CSS");
    expect(describeModKind("declarative")).toBe("CSS + JSON");
    expect(describeModKind("userscript")).toBe("Userscript");
    expect(
      describeActivityEvent({
        layer: "userscript-runtime",
        modId: "fixture.userscript",
        outcome: "denied",
        at: 1,
      }),
    ).toBe("fixture.userscript userscript denied");
  });

  test("renders disclosure copy in the popup", async () => {
    const kitten = loadUnpackedMod(join(modsRoot, "kitten-ad-replace"));
    const reddit = loadUnpackedMod(join(modsRoot, "youtube-reddit-comments"));
    const sendMessage = vi.fn(async (message: { readonly type?: string }) => {
      if (message.type === "list-activity") {
        return [
          {
            layer: "capability-gate",
            modId: "prism.kitten-ad-replace",
            capability: "visual.ad-slot.replace",
            outcome: "allowed",
            at: 1,
          },
        ];
      }
      if (message.type === "get-behaviour-policies") {
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
      if (message.type === "get-paste-policy") {
        return {
          default: true,
          denyOrigins: [],
          allow: true,
          originDenied: false,
        };
      }
      return [
        {
          manifest: kitten.manifest,
          enabled: true,
          grants: kitten.manifest.capabilities.required,
          trustKind: "declarative",
        },
        {
          manifest: reddit.manifest,
          enabled: true,
          grants: reddit.manifest.capabilities.required,
          trustKind: "declarative",
        },
        {
          manifest: {
            id: "fixture.userscript",
            version: "1.0.0",
            runtime: "userscript",
            capabilities: { required: [] },
            scopes: ["https://example.com/*"],
          },
          enabled: true,
          grants: [],
          trustKind: "userscript",
        },
      ];
    });
    const dom = new JSDOM(`<!doctype html><p id="page-origin"></p>
      <ol id="page-activity"></ol>
      <section id="global-policies"></section>
      <main id="mods"></main>
      <ol id="activity"></ol>
      <button id="undo" type="button">Undo</button>
      <input id="import-mod" type="file">`);
    await mountPopup(
      {
        runtime: { sendMessage },
        permissions: { request: vi.fn(), remove: vi.fn() },
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 3, url: "https://www.youtube.com/" },
          ]),
        },
      },
      dom.window.document,
    );

    const body = dom.window.document.body.textContent ?? "";
    expect(body).toContain(
      describeOptionalCapability("reddit.comments.search"),
    );
    expect(body).toContain(describeModHostAccess(kitten.manifest));
    expect(body).toContain(
      "prism.kitten-ad-replace visual.ad-slot.replace allowed",
    );
    expect(body).toContain("Disable on this site");
    expect(body).toContain(describePastePolicy());
    expect(body).toContain(describePastePolicyDefault());
    expect(body).toContain(describePopupSuppressPolicyDefault());
    expect(body).toContain(describeTitleFreezePolicyDefault());
    expect(body).toContain(describeScrollLockPolicyDefault());
    expect(body).toContain(describeOverlaySuppressPolicyDefault());
    expect(body).toContain(describeConsentRejectPolicyDefault());
    expect(body).toContain(describeAutoplayPolicyDefault());
    expect(body).toContain("Allow paste");
    expect(body).toContain("Turn off paste-allow on this site");
    expect(body).toContain("Suppress unsolicited popups");
    expect(body).toContain("Keep page title stable");
    expect(body).toContain("Release scroll lock");
    expect(body).toContain("Hide labelled modals and chatbots");
    expect(body).toContain("Reject labelled consent panels");
    expect(body).toContain("Constrain autoplay");
    expect(body).toContain("Turn off popup suppression on this site");
    expect(body).toContain("Turn off title freeze on this site");
    expect(body).toContain("Turn off scroll-lock release on this site");
    expect(body).toContain("Turn off overlay suppression on this site");
    expect(body).toContain("Turn off consent rejection on this site");
    expect(body).toContain("Turn off autoplay constraint on this site");
    expect(body).toContain("CSS + JSON");
    expect(body).toContain("Userscript");
    expect(body).toMatch(/Allow User Scripts/u);
  });
});

describe("Phase G docs", () => {
  test("import reports the policy finding returned by the extension", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      ok: false,
      error: "src/index.js:1 document is not available to native mod code",
    });
    const result = await importPackedArchive(
      { runtime: { sendMessage } },
      { arrayBuffer: async () => new ArrayBuffer(0) },
    );

    expect(result).toEqual({
      ok: false,
      error: "src/index.js:1 document is not available to native mod code",
    });
  });

  test("README covers load unpacked, optional caps, and known breakage", () => {
    const readme = readFileSync(
      join(repoRoot, "apps", "extension", "README.md"),
      "utf8",
    );
    expect(readme).toContain(".prism");
    expect(readme).toMatch(/Load unpacked/iu);
    expect(readme).toContain("npm run build");
    expect(readme).toContain("npm run test:e2e");
    expect(readme).toContain("reddit.comments.search");
    expect(readme).toContain("sponsor.ajay.app");
    expect(readme).toContain("youtube.watch.sponsorSegments");
    expect(readme).toContain("html5-main-video");
    expect(readme).toContain("reddit.feed.posts");
    expect(readme).toContain("youtube.watch.constrainAutoplay");
    expect(readme).toContain("ytp-autonav-toggle-button");
    expect(readme).toContain("youtube.watch.constrainEndScreens");
    expect(readme).toContain("ytp-endscreen-content");
    expect(readme).toContain("youtube.watch.constrainMiniplayer");
    expect(readme).toContain("ytd-miniplayer");
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
    expect(readme).toMatch(/this site|this origin/iu);
    expect(readme).toMatch(/Allow User Scripts/u);
    expect(readme).toContain("runtime: userscript");
    expect(readme).toContain("USER_SCRIPT");
    expect(readme).toMatch(/isolated world/iu);
    expect(readme).toMatch(/Tampermonkey/iu);
    expect(readme).toMatch(/not shipped/iu);
    expect(readme).toContain("data-prism-modal");
    expect(readme).toContain("data-prism-consent-reject");
    expect(readme).toMatch(/MutationObserver/u);
    expect(readme).toMatch(/site-owned players/iu);
  });
});
