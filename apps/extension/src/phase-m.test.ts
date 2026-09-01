import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import {
  BEHAVIOUR_POLICY_STORAGE_KEYS,
  DEFAULT_BEHAVIOUR_POLICIES,
} from "./behaviour-policies.js";
import { policyActiveForUrl } from "./origin-deny-policy.js";
import { installPopupSuppressGuard } from "./popup-suppress.js";
import { installTitleFreezeGuard } from "./title-freeze.js";
import { installScrollLockGuard } from "./scroll-lock.js";
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

function popupSpamPage(url = "https://spam.example/page"): JSDOM {
  return new JSDOM(
    readFileSync(join(fixtures, "fixtures", "popup-spam.html"), "utf8"),
    { url, runScripts: "outside-only" },
  );
}

function titleSpamPage(url = "https://spam.example/page"): JSDOM {
  return new JSDOM(
    readFileSync(join(fixtures, "fixtures", "title-spam.html"), "utf8"),
    { url },
  );
}

function scrollLockPage(url = "https://spam.example/page"): JSDOM {
  return new JSDOM(
    readFileSync(join(fixtures, "fixtures", "scroll-lock.html"), "utf8"),
    { url },
  );
}

describe("Phase M behaviour policies", () => {
  test("defaults are on with empty denyOrigins", () => {
    expect(DEFAULT_BEHAVIOUR_POLICIES["popup-suppress"]).toEqual({
      default: true,
      denyOrigins: [],
    });
    expect(DEFAULT_BEHAVIOUR_POLICIES["title-freeze"]).toEqual({
      default: true,
      denyOrigins: [],
    });
    expect(DEFAULT_BEHAVIOUR_POLICIES["scroll-lock"]).toEqual({
      default: true,
      denyOrigins: [],
    });
    expect(DEFAULT_BEHAVIOUR_POLICIES.paste.default).toBe(true);
  });

  test("blocks unsolicited window.open and synthetic target=_blank", () => {
    const dom = popupSpamPage();
    const opened = vi.fn(() => null);
    dom.window.open = opened as typeof dom.window.open;
    const guard = installPopupSuppressGuard(dom.window, true);

    expect(dom.window.open("https://ads.example/unsolicited")).toBeNull();
    expect(opened).not.toHaveBeenCalled();

    const blank = dom.window.document.getElementById("blank");
    expect(blank).toBeInstanceOf(dom.window.HTMLAnchorElement);
    if (blank === null) {
      return;
    }
    const click = new dom.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    blank.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);

    const same = dom.window.document.getElementById("same");
    expect(same).toBeInstanceOf(dom.window.HTMLAnchorElement);
    if (same === null) {
      return;
    }
    const sameClick = new dom.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    same.dispatchEvent(sameClick);
    expect(sameClick.defaultPrevented).toBe(false);
    guard.disconnect();
  });

  test("user gesture still reaches window.open", () => {
    const dom = popupSpamPage();
    const opened = vi.fn(() => null);
    dom.window.open = opened as typeof dom.window.open;
    Object.defineProperty(dom.window.navigator, "userActivation", {
      configurable: true,
      value: { isActive: true, hasBeenActive: true },
    });
    const guard = installPopupSuppressGuard(dom.window, true);
    dom.window.open("https://ads.example/gesture");
    expect(opened).toHaveBeenCalledTimes(1);
    guard.disconnect();
  });

  test("origin deny restores unsolicited popups", () => {
    const url = "https://spam.example/page";
    const policy = {
      default: true,
      denyOrigins: ["https://spam.example"],
    };
    expect(policyActiveForUrl(policy, url)).toBe(false);
    expect(policyActiveForUrl(policy, "https://other.example/")).toBe(true);

    const dom = popupSpamPage(url);
    const opened = vi.fn(() => null);
    dom.window.open = opened as typeof dom.window.open;
    const guard = installPopupSuppressGuard(
      dom.window,
      policyActiveForUrl(policy, url),
    );
    dom.window.open("https://ads.example/allowed");
    expect(opened).toHaveBeenCalledTimes(1);
    const blank = dom.window.document.getElementById("blank");
    if (blank === null) {
      return;
    }
    const click = new dom.window.MouseEvent("click", {
      bubbles: true,
      cancelable: true,
    });
    blank.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    guard.disconnect();
  });

  test("freezes title after the first non-empty value", async () => {
    const dom = titleSpamPage();
    expect(dom.window.document.title).toBe("Watch this video");
    const guard = installTitleFreezeGuard(dom.window.document, true);
    dom.window.document.title = "BUY NOW";
    expect(dom.window.document.title).toBe("Watch this video");
    const titleEl = dom.window.document.querySelector("title");
    titleEl?.replaceChildren(dom.window.document.createTextNode("!!!"));
    await vi.waitFor(() => {
      expect(dom.window.document.title).toBe("Watch this video");
    });
    guard.disconnect();
  });

  test("origin deny allows title mutation", () => {
    const url = "https://spam.example/page";
    const policy = {
      default: true,
      denyOrigins: ["https://spam.example"],
    };
    const dom = titleSpamPage(url);
    const guard = installTitleFreezeGuard(
      dom.window.document,
      policyActiveForUrl(policy, url),
    );
    dom.window.document.title = "BUY NOW";
    expect(dom.window.document.title).toBe("BUY NOW");
    guard.disconnect();
  });

  test("releases overflow hidden on html, body, and overlay traps", () => {
    const dom = scrollLockPage();
    const html = dom.window.document.documentElement;
    const body = dom.window.document.body;
    const overlay = dom.window.document.getElementById("overlay");
    expect(overlay).toBeInstanceOf(dom.window.HTMLDivElement);
    if (overlay === null) {
      return;
    }
    expect(dom.window.getComputedStyle(html).overflow).toBe("hidden");
    expect(dom.window.getComputedStyle(body).overflow).toBe("hidden");
    expect(dom.window.getComputedStyle(overlay).overflow).toBe("hidden");

    const guard = installScrollLockGuard(dom.window.document, true);
    expect(dom.window.getComputedStyle(html).overflow).toBe("auto");
    expect(dom.window.getComputedStyle(body).overflow).toBe("auto");
    expect(dom.window.getComputedStyle(overlay).overflow).toBe("auto");
    guard.disconnect();
  });

  test("origin deny leaves scroll lock in place", () => {
    const url = "https://spam.example/page";
    const policy = {
      default: true,
      denyOrigins: ["https://spam.example"],
    };
    const dom = scrollLockPage(url);
    const guard = installScrollLockGuard(
      dom.window.document,
      policyActiveForUrl(policy, url),
    );
    expect(
      dom.window.getComputedStyle(dom.window.document.documentElement).overflow,
    ).toBe("hidden");
    expect(dom.window.getComputedStyle(dom.window.document.body).overflow).toBe(
      "hidden",
    );
    guard.disconnect();
  });

  test("service worker stores each policy key and notifies tabs", async () => {
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
      "popup-suppress": { default: true, allow: true, originDenied: false },
      "title-freeze": { default: true, allow: true, originDenied: false },
      "scroll-lock": { default: true, allow: true, originDenied: false },
    });

    await expect(
      handleRuntimeMessage(
        {
          type: "set-behaviour-policy",
          policy: "popup-suppress",
          origin: "https://spam.example",
          deny: true,
        },
        { id: "fixture-extension", url: auth.popupUrl },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });
    expect(stored[BEHAVIOUR_POLICY_STORAGE_KEYS["popup-suppress"]]).toEqual({
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
      "popup-suppress": { allow: false, originDenied: true },
      "title-freeze": { allow: true, originDenied: false },
    });
  });

  test("set-behaviour-policy is popup-only and rejects a non-origin", async () => {
    const stored: StoredState = {};
    const dependencies = storedDependencies(stored);

    await expect(
      handleRuntimeMessage(
        {
          type: "set-behaviour-policy",
          policy: "title-freeze",
          default: false,
        },
        {
          id: "fixture-extension",
          url: "https://spam.example/page",
          tab: { id: 9 },
        },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: false });
    expect(dependencies.setState).not.toHaveBeenCalled();

    await expect(
      handleRuntimeMessage(
        {
          type: "set-behaviour-policy",
          policy: "scroll-lock",
          origin: "https://spam.example/path",
          deny: true,
        },
        { id: "fixture-extension", url: auth.popupUrl },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: false });
    expect(stored[BEHAVIOUR_POLICY_STORAGE_KEYS["scroll-lock"]]).toBeUndefined();
  });
});
