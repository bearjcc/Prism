import type {
  AdSlotHandle,
  BrokeredResponse,
  CapabilityId,
  PrismManifest,
  TrustedReplacement,
} from "@prism/schema";
import type { BundledMod, NativeMod } from "./loader.js";
import { loadNativeMods, type ModLoadState } from "./loader.js";
import { extractAdSlots } from "./extractors/ad-slot.js";
import {
  type PrismApiHandlers,
  TabUndoStack,
} from "./prism-api.js";

interface ContentRuntime {
  readonly runtime: {
    getURL(path: string): string;
    sendMessage<T>(message: unknown): Promise<T>;
    readonly onMessage: {
      addListener(
        listener: (
          message: ContentMessage,
          sender: unknown,
          sendResponse: (response: unknown) => void,
        ) => boolean | void,
      ): void;
    };
  };
}

declare const chrome: ContentRuntime;

interface ActiveBundledMod extends BundledMod {
  readonly grants: readonly CapabilityId[];
}

interface ActiveModsResponse {
  readonly mods: readonly ActiveBundledMod[];
}

interface ContentMessage {
  readonly type: string;
}

interface ContentModModule {
  readonly activate?: NativeMod["activate"];
}

export interface ActivateContentModsOptions {
  readonly url: string;
  readonly requestActiveMods: (url: string) => Promise<ActiveModsResponse>;
  readonly loadEntry: (entry: string) => Promise<ContentModModule>;
  readonly handlers: PrismApiHandlers;
  readonly undo: TabUndoStack;
  readonly contentDocument?: Document;
  readonly adSlotWaitMs?: number;
}

export const DEFAULT_AD_SLOT_WAIT_MS = 2_000;

const CONTENT_TAB_STACK = 0;

export async function activateContentMods(
  options: ActivateContentModsOptions,
): Promise<ModLoadState[]> {
  const { mods } = await options.requestActiveMods(options.url);
  const grantsByMod = Object.fromEntries(
    mods.map((mod) => [mod.manifest.id, mod.grants]),
  );
  const nativeMods: NativeMod[] = mods.map(({ entry, manifest }) => {
    if (entry === null) {
      return { manifest };
    }
    return {
      manifest,
      load: async () => {
        if (
          options.contentDocument !== undefined &&
          manifest.capabilities.required.includes("visual.ad-slot.replace")
        ) {
          await waitForAdSlot(
            options.contentDocument,
            options.adSlotWaitMs ?? DEFAULT_AD_SLOT_WAIT_MS,
          );
        }
        return options.loadEntry(entry);
      },
    };
  });

  return loadNativeMods(nativeMods, {
    url: options.url,
    tabId: CONTENT_TAB_STACK,
    grantsByMod,
    handlers: options.handlers,
    undo: options.undo,
  });
}

export function handleContentMessage(
  message: ContentMessage,
  undo: TabUndoStack,
): unknown {
  if (message.type === "undo-last") {
    return { undone: undo.undoLast(CONTENT_TAB_STACK) };
  }
  return { ok: false };
}

export function createContentHandlers(
  contentDocument: Document,
  resolveAsset: (modId: string, asset: string) => string = (modId, asset) =>
    `bundled-mods/${encodeURIComponent(modId)}/${asset}`,
  requestBroker: (message: {
    readonly type: "network-request";
    readonly modId: string;
    readonly contractId: string;
  }) => Promise<BrokeredResponse> = async () => ({
    status: 503,
    fields: { error: "Network broker unavailable" },
  }),
): PrismApiHandlers {
  return {
    async extract(capability): Promise<unknown> {
      if (capability !== "visual.ad-slot.replace") {
        throw new Error(`No extractor registered for ${capability}`);
      }
      return extractAdSlots(contentDocument);
    },
    replaceSlot(
      slot: AdSlotHandle,
      content: TrustedReplacement,
      manifest: PrismManifest,
    ): () => void {
      if (!manifest.assets?.includes(content.asset)) {
        throw new Error(
          `Asset ${content.asset} is not declared by ${manifest.id}`,
        );
      }
      const element = findAdSlot(contentDocument, slot);
      if (element === undefined) {
        throw new Error(`Ad slot ${slot.id} is not available`);
      }
      const previousChildren = Array.from(element.childNodes);
      const image = contentDocument.createElement("img");
      image.dataset.prismOwned = "true";
      image.src = resolveAsset(manifest.id, content.asset);
      image.alt = content.alt;
      element.replaceChildren(image);

      return () => {
        if (image.parentNode === element) {
          element.replaceChildren(...previousChildren);
        }
      };
    },
    applyCss(cssText): () => void {
      const style = contentDocument.createElement("style");
      style.dataset.prismOwned = "true";
      style.textContent = cssText;
      const root = contentDocument.head ?? contentDocument.documentElement;
      if (root === null) {
        throw new Error("Document root is not available");
      }
      root.append(style);
      return () => style.remove();
    },
    request(contractId, manifest): Promise<BrokeredResponse> {
      return requestBroker({
        type: "network-request",
        modId: manifest.id,
        contractId,
      });
    },
  };
}

export function waitForAdSlot(
  contentDocument: Document,
  timeoutMs: number = DEFAULT_AD_SLOT_WAIT_MS,
): Promise<void> {
  if (
    timeoutMs <= 0 ||
    contentDocument.querySelector("[data-prism-ad-slot]") !== null
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const view = contentDocument.defaultView;
    let settled = false;
    let observer: MutationObserver | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      observer?.disconnect();
      if (timer !== undefined) {
        view?.clearTimeout(timer);
      }
      resolve();
    };

    const MutationObserverCtor = view?.MutationObserver;
    if (MutationObserverCtor !== undefined) {
      observer = new MutationObserverCtor(() => {
        if (contentDocument.querySelector("[data-prism-ad-slot]") !== null) {
          finish();
        }
      });
      observer.observe(contentDocument, { childList: true, subtree: true });
    }

    if (view === undefined) {
      finish();
      return;
    }
    timer = view.setTimeout(finish, timeoutMs);
  });
}

function findAdSlot(
  contentDocument: Document,
  slot: AdSlotHandle,
): Element | undefined {
  return Array.from(
    contentDocument.querySelectorAll("[data-prism-ad-slot]"),
  ).find(
    (element) => element.getAttribute("data-prism-ad-slot")?.trim() === slot.id,
  );
}

if (typeof chrome !== "undefined") {
  const undo = new TabUndoStack();
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    sendResponse(handleContentMessage(message, undo));
  });
  void activateContentMods({
    url: globalThis.location.href,
    requestActiveMods: (url) =>
      chrome.runtime.sendMessage<ActiveModsResponse>({
        type: "active-mods",
        url,
      }),
    loadEntry: async (entry) =>
      import(chrome.runtime.getURL(entry)) as Promise<ContentModModule>,
    handlers: createContentHandlers(
      document,
      (modId, asset) =>
        chrome.runtime.getURL(
          `bundled-mods/${encodeURIComponent(modId)}/${asset}`,
        ),
      (message) => chrome.runtime.sendMessage<BrokeredResponse>(message),
    ),
    undo,
    contentDocument: document,
  });
}
