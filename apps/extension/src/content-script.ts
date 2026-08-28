import type {
  AdSlotHandle,
  BrokeredResponse,
  CapabilityId,
  PrismManifest,
  RedditComment,
  TrustedCommentsReplacement,
  TrustedMessageReplacement,
  TrustedReplacement,
} from "@prism/schema";
import type { BundledMod, NativeMod } from "./loader.js";
import { loadNativeMods, type ModLoadState } from "./loader.js";
import { extractAdSlots } from "./extractors/ad-slot.js";
import {
  extractYoutubeHome,
  findYoutubeHomeFeed,
} from "./extractors/youtube-home.js";
import { normaliseRedditPermalink } from "./extractors/reddit-comments.js";
import { extractYoutubeWatch } from "./extractors/youtube-watch.js";
import {
  type PrismApiHandlers,
  TabUndoStack,
} from "./prism-api.js";

export interface ContentRuntimeClient {
  getURL(path: string): string;
  sendMessage<T>(message: unknown): Promise<T>;
}

interface ContentRuntime {
  readonly runtime: ContentRuntimeClient & {
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
  readonly youtubeHomeWaitMs?: number;
  readonly youtubeWatchWaitMs?: number;
}

export const DEFAULT_AD_SLOT_WAIT_MS = 2_000;
export const DEFAULT_YOUTUBE_HOME_WAIT_MS = 2_000;
export const DEFAULT_YOUTUBE_WATCH_WAIT_MS = 2_000;
const YOUTUBE_COMMENTS_SELECTOR =
  "[data-prism-comments-slot], ytd-comments#comments";

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
        if (options.contentDocument !== undefined) {
          const waits: Promise<void>[] = [];
          if (
            manifest.capabilities.required.includes("visual.ad-slot.replace")
          ) {
            waits.push(
              waitForAdSlot(
                options.contentDocument,
                options.adSlotWaitMs ?? DEFAULT_AD_SLOT_WAIT_MS,
              ),
            );
          }
          if (
            manifest.capabilities.required.includes("youtube.home.allowlist")
          ) {
            waits.push(
              waitForYoutubeHomeFeed(
                options.contentDocument,
                options.youtubeHomeWaitMs ?? DEFAULT_YOUTUBE_HOME_WAIT_MS,
              ),
            );
          }
          if (
            manifest.capabilities.required.includes("youtube.watch.videoId")
          ) {
            waits.push(
              waitForYoutubeCommentsSlot(
                options.contentDocument,
                options.youtubeWatchWaitMs ?? DEFAULT_YOUTUBE_WATCH_WAIT_MS,
              ),
            );
          }
          await Promise.all(waits);
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
  requestRedditComments: (message: {
    readonly type: "reddit-comments-search";
    readonly modId: string;
    readonly query: string;
  }) => Promise<unknown> = async () => {
    throw new Error("Reddit comments extractor unavailable");
  },
): PrismApiHandlers {
  return {
    async extract(capability, input, manifest): Promise<unknown> {
      if (capability === "visual.ad-slot.replace") {
        return extractAdSlots(contentDocument);
      }
      if (capability === "youtube.watch.videoId") {
        return extractYoutubeWatch(
          contentDocument.location.href,
          contentDocument,
        );
      }
      if (capability === "reddit.comments.search") {
        const query = input?.query;
        if (
          typeof query !== "string" ||
          query.trim() === "" ||
          manifest === undefined
        ) {
          throw new Error("Reddit comment search query is required");
        }
        const response = await requestRedditComments({
          type: "reddit-comments-search",
          modId: manifest.id,
          query: query.trim(),
        });
        return readRedditCommentsExtraction(response);
      }
      throw new Error(`No extractor registered for ${capability}`);
    },
    replaceSlot(
      slot: AdSlotHandle,
      content: TrustedReplacement,
      manifest: PrismManifest,
    ): () => void {
      if (isRecord(content) && "kind" in content) {
        return replaceCommentsSlot(
          contentDocument,
          slot,
          readCommentsReplacement(slot, content, manifest),
        );
      }
      if (
        !isRecord(content) ||
        typeof content.asset !== "string" ||
        typeof content.alt !== "string"
      ) {
        throw new Error("Image replacement payload is invalid");
      }
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
    allowlist(surface, itemType): () => void {
      if (surface !== "youtube.home" || itemType !== "video") {
        throw new Error(`Unsupported allowlist ${surface}.${itemType}`);
      }
      const feed = findYoutubeHomeFeed(contentDocument);
      if (feed === undefined) {
        return () => {};
      }

      const previousChildren = Array.from(feed.childNodes);
      const tiles = extractYoutubeHome(feed).videos.map((video) => {
        const tile = contentDocument.createElement("article");
        tile.dataset.prismOwned = "youtube-home-video";
        tile.dataset.videoId = video.id;
        const link = contentDocument.createElement("a");
        link.href = video.href;
        link.textContent = video.title;
        tile.append(link);
        return tile;
      });
      feed.replaceChildren(...tiles);

      return () => {
        const currentChildren = Array.from(feed.childNodes);
        if (
          currentChildren.length === tiles.length &&
          currentChildren.every((child, index) => child === tiles[index])
        ) {
          feed.replaceChildren(...previousChildren);
        }
      };
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
  return waitForSelector(contentDocument, "[data-prism-ad-slot]", timeoutMs);
}

export function waitForYoutubeHomeFeed(
  contentDocument: Document,
  timeoutMs: number = DEFAULT_YOUTUBE_HOME_WAIT_MS,
): Promise<void> {
  return waitForSelector(
    contentDocument,
    "ytd-rich-grid-renderer #contents",
    timeoutMs,
  );
}

export function waitForYoutubeCommentsSlot(
  contentDocument: Document,
  timeoutMs: number = DEFAULT_YOUTUBE_WATCH_WAIT_MS,
): Promise<void> {
  return waitForSelector(
    contentDocument,
    YOUTUBE_COMMENTS_SELECTOR,
    timeoutMs,
  );
}

function waitForSelector(
  contentDocument: Document,
  selector: string,
  timeoutMs: number,
): Promise<void> {
  if (timeoutMs <= 0 || contentDocument.querySelector(selector) !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const view = contentDocument.defaultView;
    if (view === null) {
      resolve();
      return;
    }

    let settled = false;
    let observer: MutationObserver | undefined;

    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      observer?.disconnect();
      view.clearTimeout(timer);
      resolve();
    };

    const MutationObserverCtor = view.MutationObserver;
    if (MutationObserverCtor !== undefined) {
      observer = new MutationObserverCtor(() => {
        if (contentDocument.querySelector(selector) !== null) {
          finish();
        }
      });
      observer.observe(contentDocument, { childList: true, subtree: true });
    }

    const timer = view.setTimeout(finish, timeoutMs);
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

function replaceCommentsSlot(
  contentDocument: Document,
  slot: AdSlotHandle,
  content: TrustedCommentsReplacement | TrustedMessageReplacement,
): () => void {
  const fixtureElement = Array.from(
    contentDocument.querySelectorAll("[data-prism-comments-slot]"),
  ).find(
    (candidate) =>
      candidate.getAttribute("data-prism-comments-slot")?.trim() === slot.id,
  );
  const element =
    fixtureElement ??
    (slot.id === "youtube-comments"
      ? (contentDocument.querySelector("ytd-comments#comments") ?? undefined)
      : undefined);
  if (element === undefined) {
    throw new Error(`Comments slot ${slot.id} is not available`);
  }

  const previousChildren = Array.from(element.childNodes);
  const replacement = contentDocument.createElement("section");
  replacement.dataset.prismOwned = "youtube-reddit-comments";
  if (content.kind === "message") {
    const message = contentDocument.createElement("p");
    message.dataset.prismCommentsFallback = "true";
    message.textContent = content.message;
    replacement.append(message);
  } else {
    const heading = contentDocument.createElement("h2");
    heading.textContent = content.heading;
    replacement.append(heading);
    for (const comment of content.comments) {
      const article = contentDocument.createElement("article");
      article.dataset.prismRedditComment = "true";
      const author = contentDocument.createElement("strong");
      author.textContent = comment.author;
      const body = contentDocument.createElement("p");
      body.textContent = comment.body;
      const link = contentDocument.createElement("a");
      link.href = comment.permalink;
      link.textContent = "Open on Reddit";
      article.append(author, body, link);
      replacement.append(article);
    }
  }
  element.replaceChildren(replacement);

  return () => {
    if (replacement.parentNode === element) {
      element.replaceChildren(...previousChildren);
    }
  };
}

function readRedditCommentsExtraction(
  value: unknown,
): { readonly comments: readonly RedditComment[] } {
  if (!isRecord(value) || !Array.isArray(value.comments)) {
    if (isRecord(value) && value.status === 403) {
      throw new Error("Reddit comments denied");
    }
    throw new Error("Invalid Reddit comments response");
  }
  return {
    comments: value.comments.map((comment) => readRedditComment(comment)),
  };
}

function readCommentsReplacement(
  slot: AdSlotHandle,
  content: Readonly<Record<string, unknown>>,
  manifest: PrismManifest,
): TrustedCommentsReplacement | TrustedMessageReplacement {
  if (slot.id !== "youtube-comments") {
    throw new Error("Comments replacement requires slot youtube-comments");
  }
  if (
    !manifest.capabilities.optional?.includes("reddit.comments.search") ||
    !manifest.capabilities.required.includes("youtube.watch.videoId")
  ) {
    throw new Error(
      "Comments replacement requires reddit.comments.search and youtube.watch.videoId",
    );
  }
  if (content.kind === "message") {
    if (typeof content.message !== "string") {
      throw new Error("Comments replacement message is invalid");
    }
    return { kind: "message", message: content.message };
  }
  if (content.kind === "comments") {
    if (
      typeof content.heading !== "string" ||
      !Array.isArray(content.comments)
    ) {
      throw new Error("Comments replacement payload is invalid");
    }
    return {
      kind: "comments",
      heading: content.heading,
      comments: content.comments.map((comment) => readRedditComment(comment)),
    };
  }
  throw new Error("Unsupported comments replacement kind");
}

function readRedditComment(value: unknown): RedditComment {
  if (
    !isRecord(value) ||
    typeof value.author !== "string" ||
    typeof value.body !== "string" ||
    typeof value.permalink !== "string"
  ) {
    throw new Error("Reddit comment is invalid");
  }
  const permalink = normaliseRedditPermalink(value.permalink);
  if (permalink === undefined) {
    throw new Error("Reddit permalink must use HTTPS on reddit.com");
  }
  return {
    author: value.author,
    body: value.body,
    permalink,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createChromeContentHandlers(
  contentDocument: Document,
  runtime: ContentRuntimeClient,
): PrismApiHandlers {
  return createContentHandlers(
    contentDocument,
    (modId, asset) =>
      runtime.getURL(
        `bundled-mods/${encodeURIComponent(modId)}/${asset}`,
      ),
    (message) => runtime.sendMessage<BrokeredResponse>(message),
    (message) => runtime.sendMessage<unknown>(message),
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
    handlers: createChromeContentHandlers(document, chrome.runtime),
    undo,
    contentDocument: document,
  });
}
