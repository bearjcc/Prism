import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import {
  BEHAVIOUR_POLICY_STORAGE_KEYS,
  DEFAULT_BEHAVIOUR_POLICIES,
} from "./behaviour-policies.js";
import { installConsentRejectGuard } from "./consent-reject.js";
import { installOverlaySuppressGuard } from "./overlay-suppress.js";
import { policyActiveForUrl } from "./origin-deny-policy.js";
import { performSameOriginUserAction } from "./same-origin-action.js";
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

function overlayPage(url = "https://spam.example/page"): JSDOM {
  return new JSDOM(
    readFileSync(join(fixtures, "fixtures", "modal-chatbot.html"), "utf8"),
    { url },
  );
}

function consentPage(url = "https://spam.example/page"): JSDOM {
  return new JSDOM(
    readFileSync(join(fixtures, "fixtures", "consent.html"), "utf8"),
    { url },
  );
}

describe("Phase N behaviour policies", () => {
  test("defaults are on with empty denyOrigins", () => {
    expect(DEFAULT_BEHAVIOUR_POLICIES["overlay-suppress"]).toEqual({
      default: true,
      denyOrigins: [],
    });
    expect(DEFAULT_BEHAVIOUR_POLICIES["consent-reject"]).toEqual({
      default: true,
      denyOrigins: [],
    });
    expect(DEFAULT_BEHAVIOUR_POLICIES["scroll-lock"].default).toBe(true);
  });

  test("hides labelled modal and chatbot overlays only", () => {
    const dom = overlayPage();
    const page = dom.window.document.getElementById("page");
    const unlabelled = dom.window.document.getElementById("unlabelled-overlay");
    const modal = dom.window.document.getElementById("modal");
    const chatbot = dom.window.document.getElementById("chatbot");
    expect(page).toBeInstanceOf(dom.window.HTMLParagraphElement);
    expect(unlabelled).toBeInstanceOf(dom.window.HTMLDivElement);
    expect(modal).toBeInstanceOf(dom.window.HTMLDivElement);
    expect(chatbot).toBeInstanceOf(dom.window.HTMLElement);
    if (
      page === null ||
      unlabelled === null ||
      modal === null ||
      chatbot === null
    ) {
      return;
    }

    const guard = installOverlaySuppressGuard(dom.window.document, true);
    expect(dom.window.getComputedStyle(modal).display).toBe("none");
    expect(dom.window.getComputedStyle(chatbot).display).toBe("none");
    expect(dom.window.getComputedStyle(page).display).not.toBe("none");
    expect(dom.window.getComputedStyle(unlabelled).display).not.toBe("none");
    expect(unlabelled.textContent).toMatch(/Unlabelled overlay/u);
    guard.disconnect();
  });

  test("origin deny leaves labelled overlays visible", () => {
    const url = "https://spam.example/page";
    const policy = {
      default: true,
      denyOrigins: ["https://spam.example"],
    };
    expect(policyActiveForUrl(policy, url)).toBe(false);
    const dom = overlayPage(url);
    const guard = installOverlaySuppressGuard(
      dom.window.document,
      policyActiveForUrl(policy, url),
    );
    const modal = dom.window.document.getElementById("modal");
    expect(modal).toBeInstanceOf(dom.window.HTMLDivElement);
    if (modal === null) {
      return;
    }
    expect(dom.window.getComputedStyle(modal).display).not.toBe("none");
    guard.disconnect();
  });

  test("rejects labelled consent UI when policy is on", () => {
    const dom = consentPage();
    const reject = dom.window.document.getElementById("reject");
    const accept = dom.window.document.getElementById("accept");
    const banner = dom.window.document.getElementById("consent");
    expect(reject).toBeInstanceOf(dom.window.HTMLButtonElement);
    expect(accept).toBeInstanceOf(dom.window.HTMLButtonElement);
    expect(banner).toBeInstanceOf(dom.window.HTMLDivElement);
    if (reject === null || accept === null || banner === null) {
      return;
    }
    const rejected = vi.fn();
    const accepted = vi.fn();
    reject.addEventListener("click", rejected);
    accept.addEventListener("click", accepted);

    const guard = installConsentRejectGuard(dom.window.document, true);
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(accepted).not.toHaveBeenCalled();
    expect(dom.window.getComputedStyle(banner).display).toBe("none");
    guard.disconnect();
  });

  test("origin deny leaves consent UI in place", () => {
    const url = "https://spam.example/page";
    const policy = {
      default: true,
      denyOrigins: ["https://spam.example"],
    };
    const dom = consentPage(url);
    const reject = dom.window.document.getElementById("reject");
    if (reject === null) {
      return;
    }
    const rejected = vi.fn();
    reject.addEventListener("click", rejected);
    const guard = installConsentRejectGuard(
      dom.window.document,
      policyActiveForUrl(policy, url),
    );
    expect(rejected).not.toHaveBeenCalled();
    const banner = dom.window.document.getElementById("consent");
    expect(banner).toBeInstanceOf(dom.window.HTMLDivElement);
    if (banner === null) {
      return;
    }
    expect(dom.window.getComputedStyle(banner).display).not.toBe("none");
    guard.disconnect();
  });

  test("same-origin action allowlist clicks labelled reject", () => {
    const dom = consentPage();
    const reject = dom.window.document.getElementById("reject");
    if (reject === null) {
      return;
    }
    const rejected = vi.fn();
    reject.addEventListener("click", rejected);
    expect(performSameOriginUserAction(dom.window.document, "consent.reject")).toEqual({
      ok: true,
      action: "consent.reject",
      matched: 1,
    });
    expect(rejected).toHaveBeenCalledTimes(1);
  });

  test("same-origin action refuses off-list names", () => {
    const dom = consentPage();
    const accept = dom.window.document.getElementById("accept");
    if (accept === null) {
      return;
    }
    const accepted = vi.fn();
    accept.addEventListener("click", accepted);
    expect(performSameOriginUserAction(dom.window.document, "click-all")).toEqual({
      ok: false,
      action: "click-all",
      reason: "refused",
    });
    expect(performSameOriginUserAction(dom.window.document, "consent.accept")).toEqual({
      ok: false,
      action: "consent.accept",
      reason: "refused",
    });
    expect(accepted).not.toHaveBeenCalled();
  });

  test("service worker stores overlay and consent keys and notifies tabs", async () => {
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
      "overlay-suppress": { default: true, allow: true, originDenied: false },
      "consent-reject": { default: true, allow: true, originDenied: false },
    });

    await expect(
      handleRuntimeMessage(
        {
          type: "set-behaviour-policy",
          policy: "overlay-suppress",
          origin: "https://spam.example",
          deny: true,
        },
        { id: "fixture-extension", url: auth.popupUrl },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });
    expect(stored[BEHAVIOUR_POLICY_STORAGE_KEYS["overlay-suppress"]]).toEqual({
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
      "overlay-suppress": { allow: false, originDenied: true },
      "consent-reject": { allow: true, originDenied: false },
    });
  });
});
