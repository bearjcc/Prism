import { describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import { BEHAVIOUR_POLICY_IDS } from "./behaviour-policies.js";
import {
  CONTEXT_MENU_HIDE_SESSION,
  CONTEXT_MENU_HIDE_SITE,
  CONTEXT_MENU_ITEMS,
  CONTEXT_MENU_PAUSE_SITE,
} from "./context-menu.js";
import {
  applyPersistedHideRules,
  applySessionHide,
  cssSelectorForElement,
  hideRuleCss,
  restoreSessionHide,
  updateOriginHideSelectors,
} from "./element-hide.js";
import {
  findModsExploreUrl,
  findModsLabel,
  findModsSearchQuery,
  PRISM_CATALOGUE_ORIGIN,
} from "./find-mods.js";
import {
  isOriginRuntimePaused,
  updateRuntimePausedOrigins,
} from "./origin-runtime-pause.js";
import { describePinHint, partitionModsForPage } from "./popup-mods.js";
import { mountPopup } from "./popup.js";
import {
  isInjectablePageUrl,
  toolbarBadgeText,
  toolbarTitle,
} from "./toolbar-badge.js";

describe("Phase Z popup partition", () => {
  const youtubeHome = {
    manifest: {
      id: "prism.youtube-home-videos",
      scopes: ["https://www.youtube.com/"],
    },
    enabled: false,
  };
  const kitten = {
    manifest: {
      id: "prism.kitten-ad-replace",
      scopes: ["<all_urls>"],
    },
    enabled: true,
  };
  const reddit = {
    manifest: {
      id: "prism.youtube-reddit-comments",
      scopes: ["https://www.youtube.com/watch*"],
    },
    enabled: false,
  };

  test("lists matching bundled mods first including those still off", () => {
    const { matching, other } = partitionModsForPage(
      [reddit, kitten, youtubeHome],
      "https://www.youtube.com/",
    );
    expect(matching.map((mod) => mod.manifest.id)).toEqual([
      "prism.kitten-ad-replace",
      "prism.youtube-home-videos",
    ]);
    expect(other.map((mod) => mod.manifest.id)).toEqual([
      "prism.youtube-reddit-comments",
    ]);
    expect(matching.find((mod) => mod.manifest.id === youtubeHome.manifest.id)?.enabled).toBe(
      false,
    );
  });

  test("chrome pages have no matching mods", () => {
    const { matching, other } = partitionModsForPage(
      [kitten],
      "chrome://extensions",
    );
    expect(matching).toEqual([]);
    expect(other).toEqual([kitten]);
  });

  test("pin hint is a one-line extensions-menu instruction", () => {
    expect(describePinHint()).toContain("Pin Prism");
    expect(describePinHint()).toMatch(/extensions menu/u);
  });
});

describe("Phase Z toolbar badge", () => {
  test("hides the badge at zero and counts enabled mods", () => {
    expect(toolbarBadgeText(0)).toBe("");
    expect(toolbarBadgeText(3)).toBe("3");
    expect(toolbarBadgeText(100)).toBe("99+");
  });

  test("http(s) is injectable; browser pages are not", () => {
    expect(isInjectablePageUrl("https://www.youtube.com/")).toBe(true);
    expect(isInjectablePageUrl("http://127.0.0.1/ads.html")).toBe(true);
    expect(isInjectablePageUrl("chrome://settings")).toBe(false);
    expect(isInjectablePageUrl("about:blank")).toBe(false);
    expect(toolbarTitle({ injectable: false, enabledOnTab: 2 })).toBe(
      "Prism cannot run on this page.",
    );
  });
});

describe("Phase Z find mods", () => {
  test("opens Explore with a host query and does not keep www", () => {
    expect(findModsSearchQuery("www.youtube.com")).toBe("youtube.com");
    expect(findModsExploreUrl("www.youtube.com")).toBe(
      `${PRISM_CATALOGUE_ORIGIN}/explore?q=youtube.com`,
    );
    expect(findModsLabel("www.youtube.com")).toBe("Find mods for youtube.com");
  });
});

describe("Phase Z element hide", () => {
  test("session hide is reversible; persist uses sanitised CSS", () => {
    const dom = new JSDOM(
      `<!doctype html><main><div id="noise">ad</div></main>`,
    );
    const noise = dom.window.document.getElementById("noise");
    expect(noise).toBeInstanceOf(dom.window.HTMLElement);
    if (!(noise instanceof dom.window.HTMLElement)) {
      return;
    }
    expect(applySessionHide(noise)).toBe(true);
    expect(noise.style.display).toBe("none");
    restoreSessionHide(noise);
    expect(noise.getAttribute("data-prism-session-hidden")).toBeNull();
    const selector = cssSelectorForElement(noise);
    expect(selector).toBe("div#noise");
    expect(hideRuleCss(selector ?? "")).toContain("display:none");
    expect(hideRuleCss("div{background:url(https://evil.test)}")).toBeUndefined();
    applyPersistedHideRules(dom.window.document, ["div#noise"]);
    expect(
      dom.window.document.getElementById("prism-element-hides")?.textContent,
    ).toContain("div#noise");
    expect(updateOriginHideSelectors(["div#a"], "div#b", true)).toEqual([
      "div#a",
      "div#b",
    ]);
  });
});

describe("Phase Z origin pause and context menu", () => {
  test("pause is origin-scoped and first-party menu ids are fixed", () => {
    const paused = updateRuntimePausedOrigins([], "https://meet.example", true);
    expect(isOriginRuntimePaused(paused, "https://meet.example")).toBe(true);
    expect(isOriginRuntimePaused(paused, "https://other.example")).toBe(false);
    expect(CONTEXT_MENU_ITEMS.map((item) => item.id)).toEqual([
      CONTEXT_MENU_HIDE_SESSION,
      CONTEXT_MENU_HIDE_SITE,
      CONTEXT_MENU_PAUSE_SITE,
    ]);
  });
});

describe("Phase Z popup chrome", () => {
  test("orders this-site mods first and offers Find plus pin hint", async () => {
    const sendMessage = vi.fn(async (message: { readonly type?: string }) => {
      if (message.type === "get-popup-chrome") {
        return { pinHintDismissed: false, runtimePaused: false };
      }
      if (
        message.type === "get-behaviour-policies" ||
        message.type === "get-paste-policy"
      ) {
        const policies = {} as Record<
          string,
          {
            default: boolean;
            denyOrigins: string[];
            allow: boolean;
            originDenied: boolean;
            sessionDeniedOnOrigin: boolean;
          }
        >;
        for (const id of BEHAVIOUR_POLICY_IDS) {
          policies[id] = {
            default: true,
            denyOrigins: [],
            allow: true,
            originDenied: false,
            sessionDeniedOnOrigin: false,
          };
        }
        return policies;
      }
      if (message.type === "list-activity") {
        return [];
      }
      return [
        {
          manifest: {
            id: "prism.youtube-reddit-comments",
            version: "1.0.0",
            runtime: "native",
            capabilities: { required: [] },
            scopes: ["https://www.youtube.com/watch*"],
          },
          enabled: false,
          grants: [],
        },
        {
          manifest: {
            id: "prism.youtube-home-videos",
            version: "1.0.0",
            runtime: "native",
            capabilities: { required: [] },
            scopes: ["https://www.youtube.com/"],
          },
          enabled: false,
          grants: [],
        },
      ];
    });
    const dom = new JSDOM(`<!doctype html>
      <p id="page-origin"></p>
      <div id="pin-hint"></div>
      <div id="origin-pause"></div>
      <p id="find-mods"></p>
      <ol id="page-activity"></ol>
      <section id="global-policies"></section>
      <main id="mods"></main>
      <section id="other-mods"></section>
      <ol id="activity"></ol>
      <button id="undo" type="button">Undo</button>
      <input id="import-mod" type="file">`);
    await mountPopup(
      {
        runtime: { sendMessage },
        permissions: { request: vi.fn(), remove: vi.fn() },
        tabs: {
          query: vi.fn().mockResolvedValue([
            { id: 4, url: "https://www.youtube.com/" },
          ]),
          create: vi.fn(),
        },
      },
      dom.window.document,
    );
    expect(dom.window.document.getElementById("mods")?.textContent).toContain(
      "prism.youtube-home-videos",
    );
    expect(dom.window.document.getElementById("mods")?.textContent).not.toContain(
      "prism.youtube-reddit-comments",
    );
    expect(dom.window.document.getElementById("other-mods")?.textContent).toContain(
      "prism.youtube-reddit-comments",
    );
    expect(dom.window.document.getElementById("find-mods")?.textContent).toContain(
      "Find mods for youtube.com",
    );
    expect(dom.window.document.getElementById("pin-hint")?.textContent).toContain(
      "Pin Prism",
    );
    expect(
      dom.window.document.getElementById("origin-pause")?.textContent,
    ).toContain("Pause Prism on this site");
  });
});
