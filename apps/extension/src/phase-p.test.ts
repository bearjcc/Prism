import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import {
  BEHAVIOUR_POLICY_STORAGE_KEYS,
  DEFAULT_BEHAVIOUR_POLICIES,
} from "./behaviour-policies.js";
import { installAutoplayGuard } from "./autoplay-policy.js";
import { policyActiveForUrl } from "./origin-deny-policy.js";
import { createPrismApi } from "./prism-api.js";
import {
  handleRuntimeMessage,
  type ServiceWorkerDependencies,
  type StoredState,
} from "./service-worker.js";

const fixtures = dirname(fileURLToPath(import.meta.url));

const auth = {
  extensionId: "fixture-extension",
  popupUrl: "chrome-extension://fixture-extension/popup.html",
};

const nativeManifest = {
  id: "fixture.native",
  version: "1.0.0",
  runtime: "native" as const,
  capabilities: { required: [] as const },
  scopes: ["https://spam.example/*"],
};

function storedDependencies(stored: StoredState): ServiceWorkerDependencies {
  return {
    getState: vi.fn(async () => stored),
    setState: vi.fn(async (state) => {
      Object.assign(stored, state);
    }),
    sendToTab: vi.fn(),
    reloadTab: vi.fn(),
    queryTabs: vi
      .fn()
      .mockResolvedValue([{ id: 9, url: "https://spam.example/page" }]),
    syncBrowserRules: vi.fn(),
  };
}

function autoplayPage(url = "https://spam.example/page"): JSDOM {
  return new JSDOM(
    readFileSync(join(fixtures, "fixtures", "autoplay.html"), "utf8"),
    { url },
  );
}

describe("Phase P behaviour autoplay", () => {
  test("defaults are on with empty denyOrigins", () => {
    expect(DEFAULT_BEHAVIOUR_POLICIES.autoplay).toEqual({
      default: true,
      denyOrigins: [],
    });
    expect(BEHAVIOUR_POLICY_STORAGE_KEYS.autoplay).toBe("behaviour.autoplay");
    expect(DEFAULT_BEHAVIOUR_POLICIES["overlay-suppress"].default).toBe(true);
  });

  test("constrains autonav and media autoplay on the fixture", () => {
    const dom = autoplayPage();
    const autonav = dom.window.document.getElementById("autonav");
    const main = dom.window.document.getElementById("main-video");
    const genericVideo = dom.window.document.getElementById("generic-video");
    const genericAudio = dom.window.document.getElementById("generic-audio");
    expect(autonav).toBeInstanceOf(dom.window.HTMLButtonElement);
    expect(main).toBeInstanceOf(dom.window.HTMLVideoElement);
    expect(genericVideo).toBeInstanceOf(dom.window.HTMLVideoElement);
    expect(genericAudio).toBeInstanceOf(dom.window.HTMLAudioElement);
    if (
      autonav === null ||
      main === null ||
      genericVideo === null ||
      genericAudio === null
    ) {
      return;
    }

    const guard = installAutoplayGuard(dom.window.document, true);
    expect(autonav.getAttribute("aria-checked")).toBe("false");
    expect(main.hasAttribute("autoplay")).toBe(false);
    expect(genericVideo.hasAttribute("autoplay")).toBe(false);
    expect(genericAudio.hasAttribute("autoplay")).toBe(false);
    guard.disconnect();
  });

  test("origin deny leaves autoplay in place", () => {
    const url = "https://spam.example/page";
    const policy = {
      default: true,
      denyOrigins: ["https://spam.example"],
    };
    expect(policyActiveForUrl(policy, url)).toBe(false);
    const dom = autoplayPage(url);
    const guard = installAutoplayGuard(
      dom.window.document,
      policyActiveForUrl(policy, url),
    );
    const autonav = dom.window.document.getElementById("autonav");
    const main = dom.window.document.getElementById("main-video");
    expect(autonav).toBeInstanceOf(dom.window.HTMLButtonElement);
    expect(main).toBeInstanceOf(dom.window.HTMLVideoElement);
    if (autonav === null || main === null) {
      return;
    }
    expect(autonav.getAttribute("aria-checked")).toBe("true");
    expect(main.hasAttribute("autoplay")).toBe(true);
    guard.disconnect();
  });

  test("turning the guard off does not re-add autoplay", () => {
    const dom = autoplayPage();
    const guard = installAutoplayGuard(dom.window.document, true);
    const main = dom.window.document.getElementById("main-video");
    expect(main).toBeInstanceOf(dom.window.HTMLVideoElement);
    if (main === null) {
      return;
    }
    expect(main.hasAttribute("autoplay")).toBe(false);
    guard.setActive(false);
    expect(main.hasAttribute("autoplay")).toBe(false);
    guard.disconnect();
  });

  test("late autonav and autoplay media are constrained while active", async () => {
    const dom = new JSDOM("<main></main>", {
      url: "https://spam.example/page",
    });
    const guard = installAutoplayGuard(dom.window.document, true);
    const video = dom.window.document.createElement("video");
    video.className = "html5-main-video";
    video.setAttribute("autoplay", "");
    const toggle = dom.window.document.createElement("button");
    toggle.className = "ytp-autonav-toggle-button";
    toggle.setAttribute("aria-checked", "true");
    toggle.type = "button";
    dom.window.document.body.append(toggle, video);
    await Promise.resolve();
    await Promise.resolve();
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(video.hasAttribute("autoplay")).toBe(false);
    guard.disconnect();
  });

  test("service worker stores autoplay and notifies tabs", async () => {
    const stored: StoredState = {};
    const dependencies = storedDependencies(stored);

    await expect(
      handleRuntimeMessage(
        { type: "get-behaviour-policies", url: "https://spam.example/page" },
        { id: "fixture-extension" },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toMatchObject({
      paste: { default: true, allow: true, originDenied: false },
      autoplay: { default: true, allow: true, originDenied: false },
      "overlay-suppress": { default: true, allow: true, originDenied: false },
    });

    await expect(
      handleRuntimeMessage(
        {
          type: "set-behaviour-policy",
          policy: "autoplay",
          origin: "https://spam.example",
          deny: true,
        },
        { id: "fixture-extension", url: auth.popupUrl },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });
    expect(stored[BEHAVIOUR_POLICY_STORAGE_KEYS.autoplay]).toEqual({
      default: true,
      denyOrigins: ["https://spam.example"],
    });
    expect(dependencies.sendToTab).toHaveBeenCalledWith(9, {
      type: "behaviour-policies",
    });

    await expect(
      handleRuntimeMessage(
        { type: "get-behaviour-policies", url: "https://spam.example/page" },
        { id: "fixture-extension" },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toMatchObject({
      autoplay: { allow: false, originDenied: true },
      "overlay-suppress": { allow: true, originDenied: false },
    });
  });

  test("policy off or origin deny does not open eval, page fetch, or extractor HTML", async () => {
    const policies = {
      default: false,
      denyOrigins: ["https://spam.example"],
    };
    expect(policyActiveForUrl(policies, "https://spam.example/page")).toBe(
      false,
    );

    const extract = vi.fn(async () => ({ html: "<script>eval(1)</script>" }));
    const request = vi.fn(async () => ({
      ok: true as const,
      body: "fetched",
    }));
    const prism = createPrismApi({
      manifest: nativeManifest,
      grants: [],
      tabId: 1,
      handlers: { extract, request },
    });

    await expect(
      prism.extract("youtube.watch.constrainAutoplay"),
    ).resolves.toBeUndefined();
    await expect(prism.net.request("reddit.comments")).resolves.toEqual({
      status: 0,
      fields: {},
    });
    expect(extract).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(prism).not.toHaveProperty("document");
    expect(prism).not.toHaveProperty("querySelector");
    expect(prism).not.toHaveProperty("eval");
    expect(prism).not.toHaveProperty("fetch");
  });
});
