import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import { mergeOriginExclusions } from "./mod-pause.js";
import { pageActivityRows } from "./page-activity.js";
import { describeAllowOnce, mountPopup } from "./popup.js";
import { createPrismApi } from "./prism-api.js";
import {
  createSessionExceptionStore,
  isSessionExcepted,
  setSessionOriginException,
} from "./session-exception.js";
import {
  handleRuntimeMessage,
  selectActiveMods,
  type ServiceWorkerDependencies,
  type StoredState,
} from "./service-worker.js";

const hideManifest = {
  id: "fixture.hide",
  version: "1.0.0",
  runtime: "native" as const,
  capabilities: { required: ["visual.hide" as const] },
  scopes: ["<all_urls>"],
};

const auth = {
  extensionId: "fixture-extension",
  popupUrl: "chrome-extension://fixture-extension/popup.html",
};

function storedDependencies(
  stored: StoredState,
  sessionExceptions = createSessionExceptionStore(),
): ServiceWorkerDependencies {
  return {
    getState: vi.fn(async () => stored),
    setState: vi.fn(async (state) => {
      Object.assign(stored, state);
    }),
    sendToTab: vi.fn(),
    reloadTab: vi.fn(),
    queryTabs: vi.fn().mockResolvedValue([]),
    syncBrowserRules: vi.fn(),
    sessionExceptions,
  };
}

const defaultPolicy = {
  default: true,
  denyOrigins: [],
  allow: true,
  originDenied: false,
};

function allPolicies() {
  return {
    paste: defaultPolicy,
    "popup-suppress": defaultPolicy,
    "title-freeze": defaultPolicy,
    "scroll-lock": defaultPolicy,
    "overlay-suppress": defaultPolicy,
    "consent-reject": defaultPolicy,
    autoplay: defaultPolicy,
  };
}

describe("Phase Y allow once (session exception)", () => {
  test("session grant skips a mod on that origin only and is distinct from lasting site exceptions", () => {
    const store = createSessionExceptionStore();
    setSessionOriginException(
      store.mods,
      "fixture.hide",
      "https://meet.example",
      true,
    );
    expect(
      isSessionExcepted(store.mods, "fixture.hide", "https://meet.example"),
    ).toBe(true);
    expect(
      isSessionExcepted(store.mods, "fixture.hide", "https://other.example"),
    ).toBe(false);

    const mod = { manifest: hideManifest, entry: "entry.js" };
    const lasting = { "fixture.hide": ["https://lasting.example"] };
    const skips = mergeOriginExclusions(lasting, store.mods);

    expect(
      selectActiveMods(
        [mod],
        "https://meet.example/call",
        {},
        { "fixture.hide": ["visual.hide"] },
        skips,
      ),
    ).toEqual({ mods: [] });
    expect(
      selectActiveMods(
        [mod],
        "https://other.example/page",
        {},
        { "fixture.hide": ["visual.hide"] },
        skips,
      ),
    ).toEqual({
      mods: [{ ...mod, grants: ["visual.hide"] }],
    });
    expect(
      selectActiveMods(
        [mod],
        "https://lasting.example/",
        {},
        { "fixture.hide": ["visual.hide"] },
        skips,
      ),
    ).toEqual({ mods: [] });
    expect(lasting).toEqual({
      "fixture.hide": ["https://lasting.example"],
    });
  });

  test("session grant does not persist across a simulated worker restart or chrome.storage.local", async () => {
    const stored: StoredState = { enabled: {}, grants: {} };
    const session = createSessionExceptionStore();
    const dependencies = storedDependencies(stored, session);
    const mods = Promise.resolve([{ manifest: hideManifest, entry: null }]);

    await expect(
      handleRuntimeMessage(
        {
          type: "set-session-exception",
          modId: hideManifest.id,
          origin: "https://meet.example",
          excepted: true,
        },
        { id: "fixture-extension", url: auth.popupUrl },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });

    expect(dependencies.setState).not.toHaveBeenCalled();
    expect(stored.siteExceptions).toBeUndefined();
    expect(session.mods).toEqual({
      [hideManifest.id]: ["https://meet.example"],
    });

    await expect(
      handleRuntimeMessage(
        { type: "active-mods", url: "https://meet.example/call" },
        { id: "fixture-extension" },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toMatchObject({ mods: [] });
    await expect(
      handleRuntimeMessage(
        { type: "active-mods", url: "https://other.example/page" },
        { id: "fixture-extension" },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toMatchObject({
      mods: [expect.objectContaining({ manifest: hideManifest })],
    });
    await expect(
      handleRuntimeMessage(
        { type: "list-mods", url: "https://meet.example/call" },
        { id: "fixture-extension" },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        sessionExceptedOnOrigin: true,
        disabledOnOrigin: false,
      }),
    ]);

    const restarted = storedDependencies(
      stored,
      createSessionExceptionStore(),
    );
    await expect(
      handleRuntimeMessage(
        { type: "active-mods", url: "https://meet.example/call" },
        { id: "fixture-extension" },
        mods,
        restarted,
        auth,
      ),
    ).resolves.toMatchObject({
      mods: [expect.objectContaining({ manifest: hideManifest })],
    });
    expect(stored.siteExceptions).toBeUndefined();
  });

  test("explicit clear removes the session grant without writing lasting exceptions", async () => {
    const stored: StoredState = { enabled: {}, grants: {} };
    const session = createSessionExceptionStore();
    const dependencies = storedDependencies(stored, session);
    const mods = Promise.resolve([{ manifest: hideManifest, entry: null }]);

    await handleRuntimeMessage(
      {
        type: "set-session-exception",
        modId: hideManifest.id,
        origin: "https://meet.example",
        excepted: true,
      },
      { id: "fixture-extension", url: auth.popupUrl },
      mods,
      dependencies,
      auth,
    );
    await expect(
      handleRuntimeMessage(
        {
          type: "set-session-exception",
          modId: hideManifest.id,
          origin: "https://meet.example",
          excepted: false,
        },
        { id: "fixture-extension", url: auth.popupUrl },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });
    expect(session.mods).toEqual({});
    expect(stored.siteExceptions).toBeUndefined();
    await expect(
      handleRuntimeMessage(
        { type: "active-mods", url: "https://meet.example/call" },
        { id: "fixture-extension" },
        mods,
        dependencies,
        auth,
      ),
    ).resolves.toMatchObject({
      mods: [expect.objectContaining({ manifest: hideManifest })],
    });
  });

  test("session policy grant turns the policy off on that origin only until the store is replaced", async () => {
    const stored: StoredState = { enabled: {}, grants: {} };
    const session = createSessionExceptionStore();
    const dependencies = storedDependencies(stored, session);

    await expect(
      handleRuntimeMessage(
        {
          type: "set-session-exception",
          policy: "paste",
          origin: "https://meet.example",
          excepted: true,
        },
        { id: "fixture-extension", url: auth.popupUrl },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toEqual({ ok: true });
    expect(dependencies.setState).not.toHaveBeenCalled();

    await expect(
      handleRuntimeMessage(
        { type: "get-behaviour-policies", url: "https://meet.example/call" },
        { id: "fixture-extension" },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toMatchObject({
      paste: {
        allow: false,
        originDenied: false,
        sessionDeniedOnOrigin: true,
      },
      autoplay: { allow: true, sessionDeniedOnOrigin: false },
    });
    await expect(
      handleRuntimeMessage(
        { type: "get-behaviour-policies", url: "https://other.example/" },
        { id: "fixture-extension" },
        Promise.resolve([]),
        dependencies,
        auth,
      ),
    ).resolves.toMatchObject({
      paste: { allow: true, sessionDeniedOnOrigin: false },
    });

    const restarted = storedDependencies(
      stored,
      createSessionExceptionStore(),
    );
    await expect(
      handleRuntimeMessage(
        { type: "get-behaviour-policies", url: "https://meet.example/call" },
        { id: "fixture-extension" },
        Promise.resolve([]),
        restarted,
        auth,
      ),
    ).resolves.toMatchObject({
      paste: { allow: true, sessionDeniedOnOrigin: false },
    });
  });

  test("popup lists allow once and records a session exception", async () => {
    const sendMessage = vi.fn(async (message: { readonly type?: string }) => {
      if (message.type === "list-activity") {
        return [];
      }
      if (
        message.type === "get-behaviour-policies" ||
        message.type === "get-paste-policy"
      ) {
        return allPolicies();
      }
      if (message.type === "set-session-exception") {
        return { ok: true };
      }
      return [
        {
          manifest: hideManifest,
          enabled: true,
          grants: ["visual.hide"],
          sessionExceptedOnOrigin: false,
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
            { id: 3, url: "https://meet.example/call" },
          ]),
        },
      },
      dom.window.document,
    );
    expect(dom.window.document.body.textContent).toContain("Allow once this session");
    expect(describeAllowOnce()).toContain("service worker");

    const labels = [
      ...dom.window.document.querySelectorAll("#mods label"),
    ];
    const allowOnce = labels.find((label) =>
      label.textContent?.includes("Allow once this session"),
    );
    const input = allowOnce?.querySelector("input");
    expect(input).toBeTruthy();
    input!.checked = true;
    input!.dispatchEvent(new dom.window.Event("change"));
    await vi.waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: "set-session-exception",
        modId: hideManifest.id,
        origin: "https://meet.example",
        excepted: true,
      });
    });
  });

  test("page activity lists a session exception separately from a lasting site exception", () => {
    const rows = pageActivityRows(
      {
        mods: [
          {
            id: "fixture.hide",
            enabled: true,
            scopes: ["<all_urls>"],
            required: ["visual.hide"],
            optional: [],
            grants: ["visual.hide"],
            sessionExceptedOnOrigin: true,
          },
        ],
        policies: {
          paste: {
            default: true,
            denyOrigins: [],
            allow: false,
            originDenied: false,
            sessionDeniedOnOrigin: true,
          },
        },
      },
      "https://meet.example",
    );
    expect(rows).toContainEqual({
      layer: "visual",
      source: "fixture.hide",
      rule: "Session exception: content mods skip this origin until the worker restarts.",
      attribution: "known",
    });
    expect(rows).toContainEqual({
      layer: "behavioural",
      source: "Allow paste",
      rule: "Session exception: policy is not applied until the worker restarts.",
      attribution: "known",
    });
  });

  test("session grant cannot grant eval, page fetch, or extractor HTML", async () => {
    const stored: StoredState = {
      enabled: {},
      grants: { "fixture.hide": ["visual.hide"] },
    };
    const dependencies = storedDependencies(stored);
    const mods = Promise.resolve([{ manifest: hideManifest, entry: null }]);

    await handleRuntimeMessage(
      {
        type: "set-session-exception",
        modId: hideManifest.id,
        origin: "https://meet.example",
        excepted: true,
      },
      { id: "fixture-extension", url: auth.popupUrl },
      mods,
      dependencies,
      auth,
    );
    await handleRuntimeMessage(
      {
        type: "set-session-exception",
        modId: hideManifest.id,
        origin: "https://meet.example",
        excepted: false,
      },
      { id: "fixture-extension", url: auth.popupUrl },
      mods,
      dependencies,
      auth,
    );
    expect(stored.grants).toEqual({ "fixture.hide": ["visual.hide"] });

    const extract = vi.fn(async () => ({ html: "<div></div>" }));
    const request = vi.fn(async () => ({
      ok: true as const,
      body: "fetched",
    }));
    const prism = createPrismApi({
      manifest: hideManifest,
      grants: stored.grants?.["fixture.hide"] ?? [],
      tabId: 1,
      handlers: { extract, request },
    });

    await expect(prism.extract("youtube.watch.videoId")).resolves.toBeUndefined();
    await expect(prism.net.request("reddit.comments")).resolves.toEqual({
      status: 0,
      fields: {},
    });
    expect(extract).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
    expect(prism).not.toHaveProperty("document");
    expect(prism).not.toHaveProperty("eval");
    expect(prism).not.toHaveProperty("fetch");
  });
});
