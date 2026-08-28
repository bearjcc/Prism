import type { CapabilityId, PrismManifest } from "@prism/schema";
import { isCapabilityId } from "@prism/schema/capabilities";
import type { BundledMod } from "./loader.js";
import { matchesAnyScope, parseBundledMods } from "./loader.js";

interface RuntimeMessage {
  readonly type: string;
  readonly modId?: string;
  readonly enabled?: boolean;
  readonly capability?: string;
  readonly granted?: boolean;
  readonly url?: string;
  readonly tabId?: number;
}

interface StoredState {
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
  };
}

declare const chrome: ChromeApi;

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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handleMessage(message, sender.tab?.id, mods).then(sendResponse);
    return true;
  });
}

async function handleMessage(
  message: RuntimeMessage,
  tabId: number | undefined,
  modsPromise: Promise<BundledMod[]>,
): Promise<unknown> {
  const mods = await modsPromise;
  const state = await chrome.storage.local.get(["enabled", "grants"]);
  const enabled = state.enabled ?? {};
  const grants = state.grants ?? {};

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
    await chrome.storage.local.set({ enabled });
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
    await chrome.storage.local.set({ grants });
    return { ok: true };
  }
  const requestedTabId = message.tabId ?? tabId;
  if (message.type === "undo-last" && requestedTabId !== undefined) {
    return forwardUndoToTab(
      (targetTabId, targetMessage) =>
        chrome.tabs.sendMessage(targetTabId, targetMessage),
      requestedTabId,
    );
  }
  return { ok: false };
}
