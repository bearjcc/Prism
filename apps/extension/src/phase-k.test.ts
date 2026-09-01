import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import {
  handleRuntimeMessage,
  type ServiceWorkerDependencies,
  type StoredState,
} from "./service-worker.js";
import {
  DEFAULT_PASTE_POLICY,
  PASTE_POLICY_STORAGE_KEY,
  installPasteAllowGuard,
  isOrdinaryTextField,
  isPasswordField,
  pasteAllowedForUrl,
} from "./paste-policy.js";

const fixtureHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures", "paste-block.html"),
  "utf8",
);

const auth = {
  extensionId: "fixture-extension",
  popupUrl: "chrome-extension://fixture-extension/popup.html",
};

function pasteBlockPage(url = "https://blocked.example/form"): JSDOM {
  const dom = new JSDOM(fixtureHtml, { url });
  const page = (event: Event): void => {
    event.preventDefault();
  };
  for (const type of ["paste", "beforeinput", "drop", "input"] as const) {
    dom.window.document.addEventListener(type, page);
  }
  return dom;
}

function dispatchCancelable(
  view: Window,
  target: EventTarget,
  type: string,
): Event {
  const event = new view.Event(type, { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function storedDependencies(
  stored: StoredState,
): ServiceWorkerDependencies {
  return {
    getState: vi.fn(async () => stored),
    setState: vi.fn(async (state) => {
      Object.assign(stored, state);
    }),
    sendToTab: vi.fn(),
    reloadTab: vi.fn(),
    queryTabs: vi.fn().mockResolvedValue([{ id: 9, url: "https://blocked.example/form" }]),
    syncBrowserRules: vi.fn(),
  };
}

describe("Phase K paste policy", () => {
  test("defaults to allowing paste globally", () => {
    expect(DEFAULT_PASTE_POLICY).toEqual({
      default: true,
      denyOrigins: [],
    });
    expect(
      pasteAllowedForUrl(DEFAULT_PASTE_POLICY, "https://blocked.example/form"),
    ).toBe(true);
  });

  test("does not treat password fields as ordinary text", () => {
    const dom = pasteBlockPage();
    const password = dom.window.document.getElementById("password");
    const text = dom.window.document.getElementById("text");
    expect(isPasswordField(password)).toBe(true);
    expect(isOrdinaryTextField(password)).toBe(false);
    expect(isOrdinaryTextField(text)).toBe(true);
  });

  test("policy on stops the page cancelling paste into ordinary text fields", () => {
    const dom = pasteBlockPage();
    const text = dom.window.document.getElementById("text");
    const notes = dom.window.document.getElementById("notes");
    expect(text).toBeInstanceOf(dom.window.HTMLInputElement);
    expect(notes).toBeInstanceOf(dom.window.HTMLTextAreaElement);
    if (text === null || notes === null) {
      return;
    }

    const guard = installPasteAllowGuard(dom.window.document, true);
    const paste = dispatchCancelable(dom.window, text, "paste");
    const beforeinput = dispatchCancelable(dom.window, text, "beforeinput");
    const drop = dispatchCancelable(dom.window, notes, "drop");

    expect(paste.defaultPrevented).toBe(false);
    expect(beforeinput.defaultPrevented).toBe(false);
    expect(drop.defaultPrevented).toBe(false);
    guard.disconnect();
  });

  test("password fields keep site preventDefault when policy is on", () => {
    const dom = pasteBlockPage();
    const password = dom.window.document.getElementById("password");
    expect(password).toBeInstanceOf(dom.window.HTMLInputElement);
    if (password === null) {
      return;
    }

    const guard = installPasteAllowGuard(dom.window.document, true);
    const paste = dispatchCancelable(dom.window, password, "paste");
    expect(paste.defaultPrevented).toBe(true);
    guard.disconnect();
  });

  test("origin deny restores the page paste block", () => {
    const url = "https://blocked.example/form";
    const policy = {
      default: true,
      denyOrigins: ["https://blocked.example"],
    };
    expect(pasteAllowedForUrl(policy, url)).toBe(false);
    expect(pasteAllowedForUrl(policy, "https://other.example/")).toBe(true);

    const dom = pasteBlockPage(url);
    const text = dom.window.document.getElementById("text");
    if (text === null) {
      return;
    }
    const guard = installPasteAllowGuard(
      dom.window.document,
      pasteAllowedForUrl(policy, url),
    );
    expect(dispatchCancelable(dom.window, text, "paste").defaultPrevented).toBe(true);
    guard.disconnect();
  });

  test("service worker stores behaviour.paste and notifies tabs", async () => {
    const stored: StoredState = {};
    const dependencies = storedDependencies(stored);

    await expect(
      handleRuntimeMessage(
        { type: "get-paste-policy", url: "https://blocked.example/form" },
        { id: "fixture-extension", url: "https://blocked.example/form" },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({
      default: true,
      denyOrigins: [],
      allow: true,
      originDenied: false,
      sessionDeniedOnOrigin: false,
    });

    await expect(
      handleRuntimeMessage(
        {
          type: "set-paste-policy",
          origin: "https://blocked.example",
          deny: true,
        },
        { id: "fixture-extension", url: auth.popupUrl },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });
    expect(stored[PASTE_POLICY_STORAGE_KEY]).toEqual({
      default: true,
      denyOrigins: ["https://blocked.example"],
    });
    expect(dependencies.sendToTab).toHaveBeenCalledWith(9, {
      type: "paste-policy",
    });

    await expect(
      handleRuntimeMessage(
        { type: "get-paste-policy", url: "https://blocked.example/form" },
        { id: "fixture-extension" },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({
      default: true,
      denyOrigins: ["https://blocked.example"],
      allow: false,
      originDenied: true,
      sessionDeniedOnOrigin: false,
    });
  });

  test("set-paste-policy is popup-only and rejects a non-origin", async () => {
    const stored: StoredState = {};
    const dependencies = storedDependencies(stored);

    await expect(
      handleRuntimeMessage(
        { type: "set-paste-policy", default: false },
        {
          id: "fixture-extension",
          url: "https://blocked.example/form",
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
          type: "set-paste-policy",
          origin: "https://blocked.example/path",
          deny: true,
        },
        { id: "fixture-extension", url: auth.popupUrl },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: false });
    expect(stored[PASTE_POLICY_STORAGE_KEY]).toBeUndefined();
  });
});
