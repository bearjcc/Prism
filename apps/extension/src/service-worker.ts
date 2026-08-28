import type {
  BrokeredResponse,
  CapabilityId,
  PrismManifest,
} from "@prism/schema";
import { isCapabilityId } from "@prism/schema/capabilities";
import {
  type DynamicRulesApi,
  syncBrowserBlockRules,
} from "./dnr.js";
import type { BundledMod } from "./loader.js";
import { matchesAnyScope, parseBundledMods } from "./loader.js";
import { createRedditCommentSearchUrl } from "./extractors/reddit-comments.js";

interface RuntimeMessage {
  readonly type: string;
  readonly modId?: string;
  readonly enabled?: boolean;
  readonly capability?: string;
  readonly granted?: boolean;
  readonly url?: string;
  readonly tabId?: number;
  readonly contractId?: string;
  readonly query?: string;
}

export interface StoredState {
  enabled?: Record<string, boolean>;
  grants?: Record<string, string[]>;
}

interface ChromeApi {
  readonly runtime: {
    getURL(path: string): string;
    readonly onMessage: {
      addListener(
        listener: (
          message: RuntimeMessage,
          sender: { tab?: { id?: number } },
          sendResponse: (response: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  };
  readonly storage: {
    readonly local: {
      get(keys: string[]): Promise<StoredState>;
      set(state: StoredState): Promise<void>;
    };
  };
  readonly tabs: {
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    reload(tabId: number): Promise<void>;
  };
  readonly declarativeNetRequest: DynamicRulesApi;
}

declare const chrome: ChromeApi;

export interface ServiceWorkerDependencies {
  readonly getState: () => Promise<StoredState>;
  readonly setState: (state: StoredState) => Promise<void>;
  readonly sendToTab: (
    tabId: number,
    message: unknown,
  ) => Promise<unknown>;
  readonly reloadTab: (tabId: number) => Promise<void>;
  readonly syncBrowserRules: (
    mods: readonly BundledMod[],
    enabled: Readonly<Record<string, boolean>>,
    grants: Readonly<Record<string, readonly string[]>>,
  ) => Promise<void>;
  readonly fetchRedditHtml?: (query: string) => Promise<string>;
}

export async function loadBundledModIndex(
  fetchIndex: () => Promise<string>,
): Promise<BundledMod[]> {
  return parseBundledMods(await fetchIndex());
}

export function forwardUndoToTab(
  sendToTab: (tabId: number, message: unknown) => Promise<unknown>,
  tabId: number,
): Promise<unknown> {
  return sendToTab(tabId, { type: "undo-last" });
}

export function selectActiveMods(
  mods: readonly BundledMod[],
  url: string,
  enabled: Readonly<Record<string, boolean>>,
  grants: Readonly<Record<string, readonly string[]>>,
): {
  readonly mods: ReadonlyArray<
    BundledMod & { readonly grants: readonly CapabilityId[] }
  >;
} {
  return {
    mods: mods
      .filter(
        ({ manifest }) =>
          (enabled[manifest.id] ?? true) &&
          matchesAnyScope(manifest.scopes, url),
      )
      .map((mod) => ({
        ...mod,
        grants: (
          grants[mod.manifest.id] ?? mod.manifest.capabilities.required
        ).filter(isCapabilityId),
      })),
  };
}

export function updateOptionalGrant(
  manifest: PrismManifest,
  current: readonly string[],
  capability: string,
  granted: boolean,
): CapabilityId[] {
  const optional = manifest.capabilities.optional ?? [];
  if (!isCapabilityId(capability) || !optional.includes(capability)) {
    throw new Error(`${capability} is not optional for ${manifest.id}`);
  }

  const selected = new Set(
    current.filter(
      (entry): entry is CapabilityId =>
        isCapabilityId(entry) && optional.includes(entry),
    ),
  );
  if (granted) {
    selected.add(capability);
  } else {
    selected.delete(capability);
  }
  return [
    ...manifest.capabilities.required,
    ...optional.filter((entry) => selected.has(entry)),
  ];
}

if (typeof chrome !== "undefined") {
  const mods = loadBundledModIndex(async () => {
    const response = await fetch(chrome.runtime.getURL("bundled-mods.json"));
    if (!response.ok) {
      throw new Error(`Could not load bundled mods: ${response.status}`);
    }
    return response.text();
  });
  const dependencies = createChromeDependencies();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handleRuntimeMessage(
      message,
      sender.tab?.id,
      mods,
      dependencies,
    ).then(sendResponse);
    return true;
  });
  void syncInitialBrowserRules(mods, dependencies);
}

export async function handleRuntimeMessage(
  message: RuntimeMessage,
  tabId: number | undefined,
  modsPromise: Promise<BundledMod[]>,
  dependencies: ServiceWorkerDependencies,
): Promise<unknown> {
  const mods = await modsPromise;
  const state = await dependencies.getState();
  const enabled = { ...state.enabled };
  const grants = { ...state.grants };

  if (message.type === "list-mods") {
    return mods.map(({ manifest }) => ({
      manifest,
      enabled: enabled[manifest.id] ?? true,
      grants: grants[manifest.id] ?? manifest.capabilities.required,
    }));
  }
  if (message.type === "active-mods" && message.url !== undefined) {
    return selectActiveMods(mods, message.url, enabled, grants);
  }
  if (
    message.type === "set-enabled" &&
    message.modId !== undefined &&
    message.enabled !== undefined
  ) {
    enabled[message.modId] = message.enabled;
    await dependencies.syncBrowserRules(mods, enabled, grants);
    await dependencies.setState({ enabled });
    const requestedTabId = message.tabId ?? tabId;
    if (!message.enabled && requestedTabId !== undefined) {
      await dependencies.reloadTab(requestedTabId);
    }
    return { ok: true };
  }
  if (
    message.type === "set-capability" &&
    message.modId !== undefined &&
    message.capability !== undefined &&
    message.granted !== undefined
  ) {
    const manifest = mods.find(
      (mod) => mod.manifest.id === message.modId,
    )?.manifest;
    if (manifest === undefined) {
      return { ok: false };
    }
    grants[message.modId] = updateOptionalGrant(
      manifest,
      grants[message.modId] ?? [],
      message.capability,
      message.granted,
    );
    await dependencies.syncBrowserRules(mods, enabled, grants);
    await dependencies.setState({ grants });
    return { ok: true };
  }
  if (
    message.type === "reddit-comments-html" &&
    message.modId !== undefined &&
    message.query !== undefined
  ) {
    const manifest = mods.find(
      (mod) => mod.manifest.id === message.modId,
    )?.manifest;
    if (
      manifest === undefined ||
      enabled[message.modId] === false ||
      !manifest.capabilities.optional?.includes("reddit.comments.search") ||
      !grants[message.modId]?.includes("reddit.comments.search") ||
      dependencies.fetchRedditHtml === undefined
    ) {
      return { status: 403, error: "Reddit comments denied" };
    }
    return {
      html: await dependencies.fetchRedditHtml(message.query),
    };
  }
  if (
    message.type === "network-request" &&
    message.modId !== undefined &&
    message.contractId !== undefined
  ) {
    return handleBrokerRequest(
      mods,
      enabled,
      grants,
      message.modId,
      message.contractId,
    );
  }
  const requestedTabId = message.tabId ?? tabId;
  if (message.type === "undo-last" && requestedTabId !== undefined) {
    return forwardUndoToTab(
      dependencies.sendToTab,
      requestedTabId,
    );
  }
  return { ok: false };
}

export function handleBrokerRequest(
  mods: readonly BundledMod[],
  enabled: Readonly<Record<string, boolean>>,
  grants: Readonly<Record<string, readonly string[]>>,
  modId: string,
  contractId: string,
): BrokeredResponse {
  const manifest = mods.find((mod) => mod.manifest.id === modId)?.manifest;
  const contract = manifest?.egress?.contracts.find(
    (entry) => entry.id === contractId,
  );
  if (
    manifest === undefined ||
    enabled[modId] === false ||
    !grants[modId]?.includes("network.egress") ||
    contract === undefined
  ) {
    return {
      status: 403,
      fields: { error: "Network request denied" },
    };
  }
  return {
    status: 503,
    fields: { error: "Network broker unavailable" },
  };
}

function createChromeDependencies(): ServiceWorkerDependencies {
  return {
    getState: () => chrome.storage.local.get(["enabled", "grants"]),
    setState: (state) => chrome.storage.local.set(state),
    sendToTab: (tabId, message) =>
      chrome.tabs.sendMessage(tabId, message),
    reloadTab: (tabId) => chrome.tabs.reload(tabId),
    syncBrowserRules: (mods, enabled, grants) =>
      syncBrowserBlockRules(
        mods,
        enabled,
        grants,
        readBundledBrowserFilter,
        chrome.declarativeNetRequest,
      ),
    fetchRedditHtml: fetchRedditCommentsHtml,
  };
}

async function fetchRedditCommentsHtml(query: string): Promise<string> {
  const response = await fetch(createRedditCommentSearchUrl(query), {
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(`Reddit comment search failed: ${response.status}`);
  }
  return response.text();
}

async function readBundledBrowserFilter(
  modId: string,
  path: string,
): Promise<string> {
  const response = await fetch(
    chrome.runtime.getURL(
      `bundled-mods/${encodeURIComponent(modId)}/${path}`,
    ),
  );
  if (!response.ok) {
    throw new Error(
      `Could not load browser filter for ${modId}: ${response.status}`,
    );
  }
  return response.text();
}

async function syncInitialBrowserRules(
  modsPromise: Promise<BundledMod[]>,
  dependencies: ServiceWorkerDependencies,
): Promise<void> {
  const [mods, state] = await Promise.all([
    modsPromise,
    dependencies.getState(),
  ]);
  await dependencies.syncBrowserRules(
    mods,
    state.enabled ?? {},
    state.grants ?? {},
  );
}
