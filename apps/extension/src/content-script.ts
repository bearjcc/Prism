import type { CapabilityId } from "@prism/schema";
import type { BundledMod, NativeMod } from "./loader.js";
import { loadNativeMods, type ModLoadState } from "./loader.js";
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
}

const CONTENT_TAB_STACK = 0;

export async function activateContentMods(
  options: ActivateContentModsOptions,
): Promise<ModLoadState[]> {
  const { mods } = await options.requestActiveMods(options.url);
  const grantsByMod = Object.fromEntries(
    mods.map((mod) => [mod.manifest.id, mod.grants]),
  );
  const nativeMods: NativeMod[] = mods.map(({ entry, manifest }) => ({
    manifest,
    ...(entry === null
      ? {}
      : { load: async () => options.loadEntry(entry) }),
  }));

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
): PrismApiHandlers {
  return {
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
  };
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
    handlers: createContentHandlers(document),
    undo,
  });
}
