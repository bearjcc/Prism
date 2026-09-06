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
import { urlMatchesEgressContract } from "@prism/schema/egress";
import {
  applyFootprintToImage,
  measureAdSlotFootprint,
} from "./ad-slot-replace.js";
import { cosmeticHideCss, type CosmeticHideInstruction } from "./dnr.js";
import { loadNativeMods, type BundledMod, type ModLoadState, type NativeMod } from "./loader.js";
import {
  extractAdSlots,
  LIVE_AD_SLOT_SELECTOR,
} from "./extractors/ad-slot.js";
import {
  extractYoutubeHome,
  findYoutubeHomeFeed,
  defaultYoutubeThumbnailUrl,
  youtubeHomeFeedChildren,
  type YoutubeHomeVideo,
} from "./extractors/youtube-home.js";
import { normaliseRedditPermalink } from "./extractors/reddit-comments.js";
import {
  dismissYoutubeIdlePrompt,
  constrainYoutubeAutoplay,
  constrainYoutubeEndScreens,
  constrainYoutubeMiniplayer,
  extractYoutubeAutoplay,
  extractYoutubeEndScreens,
  extractYoutubeIdlePrompt,
  extractYoutubeMiniplayer,
  extractYoutubeWatch,
} from "./extractors/youtube-watch.js";
import {
  applySponsorSegmentSkips,
  findWatchVideo,
  readSponsorSegmentsVideoId,
  type SponsorSegmentsExtraction,
} from "./extractors/sponsor-segments.js";
import {
  applySearchDirectLinks,
  searchPageHasWrappedLinks,
} from "./extractors/search-direct-links.js";
import {
  extractRedditFeedPosts,
  LIVE_REDDIT_FEED_SELECTOR,
  redditFeedHasUnlabelledPosts,
} from "./extractors/reddit-feed.js";
import {
  applyPersistedHideRules,
  applySessionHide,
  cssSelectorForElement,
  hideRuleCss,
  restoreSessionHide,
} from "./element-hide.js";
import {
  type PrismApiHandlers,
  TabUndoStack,
} from "./prism-api.js";
import type { ActivityEvent } from "./gate.js";
import { reportModLoadOutcomes } from "./mod-pause.js";
import { installPasteAllowGuard } from "./paste-policy.js";
import { installPopupSuppressGuard } from "./popup-suppress.js";
import { installTitleFreezeGuard } from "./title-freeze.js";
import { installScrollLockGuard } from "./scroll-lock.js";
import { installOverlaySuppressGuard } from "./overlay-suppress.js";
import { installConsentRejectGuard } from "./consent-reject.js";
import { installAutoplayGuard } from "./autoplay-policy.js";
import { runNativeModInSandbox } from "./sandbox-runtime.js";

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
  readonly cosmetics?: readonly CosmeticHideInstruction[];
}

interface ActiveModsResponse {
  readonly mods: readonly ActiveBundledMod[];
  readonly userscriptsAvailable?: boolean;
}

interface ContentMessage {
  readonly type: string;
  readonly modId?: string;
  readonly url?: string;
  readonly allow?: boolean;
  readonly persist?: boolean;
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
  readonly redditFeedWaitMs?: number;
  readonly signal?: AbortSignal;
  readonly onPendingModIds?: (modIds: readonly string[]) => void;
  readonly onStateChange?: (state: ModLoadState) => void;
  readonly emit?: (event: ActivityEvent) => void | Promise<void>;
  readonly importedAssets?: Map<string, string>;
  readonly reportLoadOutcomes?: (
    states: readonly ModLoadState[],
    url: string,
  ) => void | Promise<void>;
}

export const DEFAULT_AD_SLOT_WAIT_MS = 2_000;
export const DEFAULT_YOUTUBE_HOME_WAIT_MS = 2_000;
export const DEFAULT_YOUTUBE_WATCH_WAIT_MS = 2_000;
export const DEFAULT_REDDIT_FEED_WAIT_MS = 2_000;
/** Live Home feeds are too volatile to restore from a full childNodes snapshot. */
export const MAX_YOUTUBE_HOME_UNDO_CHILDREN = 24;
const MAX_YOUTUBE_HOME_ALLOWLIST_PASSES = 200;
const YOUTUBE_HOME_TILE_STYLE_ID = "prism-youtube-home-tiles";
const YOUTUBE_HOME_TILE_CSS = `
[data-prism-youtube-home-grid] {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  column-gap: 16px;
  row-gap: 24px;
  width: 100%;
}

article[data-prism-owned="youtube-home-video"] {
  box-sizing: border-box;
  display: block;
  width: auto;
  max-width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  font: 14px/1.4 Roboto, Arial, sans-serif;
  color: #0f0f0f;
}

article[data-prism-owned="youtube-home-video"] a.prism-yt-home-card {
  display: block;
  color: inherit;
  text-decoration: none;
}

article[data-prism-owned="youtube-home-video"] .prism-yt-home-thumb {
  display: block;
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #f2f2f2;
  border-radius: 12px;
}

article[data-prism-owned="youtube-home-video"] .prism-yt-home-thumb.prism-yt-home-thumb-missing {
  display: none;
}

article[data-prism-owned="youtube-home-video"] .prism-yt-home-thumb img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

article[data-prism-owned="youtube-home-video"] .prism-yt-home-title {
  display: block;
  margin-top: 12px;
  max-height: 4.2em;
  overflow: hidden;
}
`;

export function youtubeHomeTileStylesheet(): string {
  return YOUTUBE_HOME_TILE_CSS;
}
const YOUTUBE_COMMENTS_SELECTOR =
  "[data-prism-comments-slot], ytd-comments#comments";

const CONTENT_TAB_STACK = 0;

export async function activateContentMods(
  options: ActivateContentModsOptions,
): Promise<ModLoadState[]> {
  if (options.signal?.aborted) {
    return [];
  }
  const { mods, userscriptsAvailable } = await options.requestActiveMods(
    options.url,
  );
  if (options.signal?.aborted) {
    return [];
  }
  rememberImportedAssets(options.importedAssets, mods);
  options.onPendingModIds?.(mods.map((mod) => mod.manifest.id));
  const grantsByMod = Object.fromEntries(
    mods.map((mod) => [mod.manifest.id, mod.grants]),
  );
  const nativeMods: NativeMod[] = mods.map((mod) => {
    const { entry, manifest } = mod;
    if (entry === null || manifest.runtime === "userscript") {
      return {
        manifest,
        files: mod.files,
        styles: mod.styles,
        entrySource: mod.entrySource,
      };
    }
    return {
      manifest,
      files: mod.files,
      styles: mod.styles,
      entrySource: mod.entrySource,
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
                options.signal,
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
                options.signal,
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
                options.signal,
              ),
            );
          }
          if (manifest.capabilities.required.includes("reddit.feed.posts")) {
            waits.push(
              waitForRedditFeed(
                options.contentDocument,
                options.redditFeedWaitMs ?? DEFAULT_REDDIT_FEED_WAIT_MS,
                options.signal,
              ),
            );
          }
          await Promise.all(waits);
        }
        throwIfAborted(options.signal);
        if (isBundledExtensionEntry(entry)) {
          return options.loadEntry(entry);
        }
        if (mod.entrySource !== undefined) {
          return {};
        }
        if (entry !== null) {
          return options.loadEntry(entry);
        }
        throw new Error(`Bundled mod ${manifest.id} has no entry`);
      },
    };
  });

  try {
    const states = await loadNativeMods(nativeMods, {
      url: options.url,
      tabId: CONTENT_TAB_STACK,
      grantsByMod,
      handlers: options.handlers,
      undo: options.undo,
      onStateChange: options.onStateChange,
      userscriptsAvailable: userscriptsAvailable === true,
      signal: options.signal,
      runEntry: (source, prism, signal) =>
        runNativeModInSandbox(
          source,
          prism,
          options.contentDocument,
          signal,
        ),
      ...(options.emit === undefined ? {} : { emit: options.emit }),
    });
    if (options.signal?.aborted) {
      return [];
    }
    applyActiveCosmeticHides(mods, options);
    try {
      await (options.reportLoadOutcomes?.(states, options.url) ??
        Promise.resolve());
    } catch {
      // Outcome reporting must not break page load.
    }
    return states;
  } catch (error) {
    if (isAbortError(error)) {
      return [];
    }
    throw error;
  }
}

export interface ContentSessionOptions {
  readonly requestActiveMods: ActivateContentModsOptions["requestActiveMods"];
  readonly loadEntry: ActivateContentModsOptions["loadEntry"];
  readonly handlers: PrismApiHandlers;
  readonly undo: TabUndoStack;
  readonly contentDocument?: Document;
  readonly adSlotWaitMs?: number;
  readonly youtubeHomeWaitMs?: number;
  readonly youtubeWatchWaitMs?: number;
  readonly redditFeedWaitMs?: number;
  readonly importedAssets?: Map<string, string>;
  readonly emit?: (event: ActivityEvent) => void | Promise<void>;
  readonly reportLoadOutcomes?: (
    states: readonly ModLoadState[],
    url: string,
  ) => void | Promise<void>;
}

export interface ContentSession {
  readonly activeModIds: ReadonlySet<string>;
  run(url: string): Promise<ModLoadState[]>;
  refresh(url: string): Promise<ModLoadState[]>;
  abort(): void;
}

export function createContentSession(
  options: ContentSessionOptions,
): ContentSession {
  const activeModIds = new Set<string>();
  let controller = new AbortController();
  let runGeneration = 0;
  let inflight: Promise<ModLoadState[]> | undefined;
  let queuedRefreshUrl: string | undefined;

  async function activate(
    url: string,
    signal: AbortSignal,
    generation: number,
  ): Promise<ModLoadState[]> {
    try {
      return await activateContentMods({
        ...options,
        url,
        signal,
        onPendingModIds: (modIds) => {
          if (generation !== runGeneration) {
            return;
          }
          activeModIds.clear();
          for (const id of modIds) {
            activeModIds.add(id);
          }
        },
        onStateChange: (state) => {
          if (
            generation !== runGeneration ||
            (state.status !== "active" && state.status !== "failed")
          ) {
            return;
          }
          activeModIds.add(state.id);
        },
      });
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        return [];
      }
      throw error;
    }
  }

  async function flushQueuedRefresh(): Promise<void> {
    const url = queuedRefreshUrl;
    queuedRefreshUrl = undefined;
    if (url === undefined) {
      return;
    }
    await runActivation(url, "refresh");
  }

  async function runActivation(
    url: string,
    mode: "run" | "refresh",
  ): Promise<ModLoadState[]> {
    if (inflight !== undefined && mode === "refresh") {
      queuedRefreshUrl = url;
      return [];
    }
    const generation = runGeneration;
    const signal = controller.signal;
    inflight = activate(url, signal, generation);
    try {
      return await inflight;
    } finally {
      inflight = undefined;
      if (generation === runGeneration) {
        await flushQueuedRefresh();
      }
    }
  }

  return {
    get activeModIds() {
      return activeModIds;
    },
    abort(): void {
      controller.abort();
    },
    async run(url: string): Promise<ModLoadState[]> {
      ++runGeneration;
      controller.abort();
      controller = new AbortController();
      queuedRefreshUrl = undefined;
      options.undo.clear(CONTENT_TAB_STACK);
      activeModIds.clear();
      if (inflight !== undefined) {
        await inflight.catch(() => []);
      }
      return runActivation(url, "run");
    },
    async refresh(url: string): Promise<ModLoadState[]> {
      return runActivation(url, "refresh");
    },
  };
}

export interface SpaNavigationOptions {
  readonly getHref: () => string;
  readonly onNavigate: (href: string) => void;
  readonly history: History;
  readonly target: EventTarget;
}

export function watchSpaNavigation(options: SpaNavigationOptions): () => void {
  let current = options.getHref();
  const notify = (): void => {
    const next = options.getHref();
    if (next === current) {
      return;
    }
    current = next;
    options.onNavigate(next);
  };

  const history = options.history;
  const pushState = history.pushState.bind(history);
  const replaceState = history.replaceState.bind(history);
  history.pushState = ((...args: Parameters<History["pushState"]>) => {
    const result = pushState(...args);
    notify();
    return result;
  }) as History["pushState"];
  history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    const result = replaceState(...args);
    notify();
    return result;
  }) as History["replaceState"];

  options.target.addEventListener("popstate", notify);
  options.target.addEventListener("yt-navigate-finish", notify);

  return () => {
    history.pushState = pushState;
    history.replaceState = replaceState;
    options.target.removeEventListener("popstate", notify);
    options.target.removeEventListener("yt-navigate-finish", notify);
  };
}

export function handleContentMessage(
  message: ContentMessage,
  undo: TabUndoStack,
  activeModIds: ReadonlySet<string> = new Set(),
): unknown {
  if (message.type === "undo-last") {
    return { undone: undo.undoLast(CONTENT_TAB_STACK) };
  }
  if (message.type === "is-mod-active" && message.modId !== undefined) {
    return { active: activeModIds.has(message.modId) };
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
  requestSponsorSegments: (message: {
    readonly type: "youtube-watch-sponsor-segments";
    readonly modId: string;
    readonly videoId: string;
  }) => Promise<unknown> = async () => {
    throw new Error("SponsorBlock extractor unavailable");
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
      if (capability === "youtube.watch.dismissIdle") {
        return dismissYoutubeIdlePrompt(contentDocument);
      }
      if (capability === "youtube.watch.constrainAutoplay") {
        return constrainYoutubeAutoplay(contentDocument);
      }
      if (capability === "youtube.watch.constrainEndScreens") {
        return constrainYoutubeEndScreens(contentDocument);
      }
      if (capability === "youtube.watch.constrainMiniplayer") {
        return constrainYoutubeMiniplayer(contentDocument);
      }
      if (capability === "youtube.watch.sponsorSegments") {
        if (manifest === undefined) {
          throw new Error("SponsorBlock search requires a mod manifest");
        }
        const response = await requestSponsorSegments({
          type: "youtube-watch-sponsor-segments",
          modId: manifest.id,
          videoId: readSponsorSegmentsVideoId(input),
        });
        const extraction = readSponsorSegmentsExtraction(response);
        const video = findWatchVideo(contentDocument);
        if (video !== undefined) {
          applySponsorSegmentSkips(video, extraction.segments);
        }
        return extraction;
      }
      if (capability === "search.results.directLinks") {
        return applySearchDirectLinks(contentDocument);
      }
      if (capability === "reddit.feed.posts") {
        return extractRedditFeedPosts(contentDocument);
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
        if (
          content.kind === "comments" ||
          slot.id === "youtube-comments"
        ) {
          return replaceCommentsSlot(
            contentDocument,
            slot,
            readCommentsReplacement(slot, content, manifest),
          );
        }
        if (content.kind === "message") {
          return replaceAdSlotWithMessage(
            contentDocument,
            slot,
            readAdSlotMessage(content),
          );
        }
        if (content.kind === "remote-image") {
          return replaceAdSlotWithRemoteImage(
            contentDocument,
            slot,
            manifest,
            readRemoteImageReplacement(content),
          );
        }
        throw new Error("Unsupported replacement kind");
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
      return replaceAdSlotWithImage(
        contentDocument,
        slot,
        resolveAsset(manifest.id, content.asset),
        content.alt,
      );
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
    allowlist(surface, itemType): void | (() => void) {
      try {
        if (surface !== "youtube.home" || itemType !== "video") {
          return undefined;
        }
        const feed = findYoutubeHomeFeed(contentDocument);
        if (feed === undefined || !feed.isConnected) {
          return () => {};
        }

        let previousChildren: readonly ChildNode[] | undefined;
        try {
          const firstConversion =
            feed.querySelector('[data-prism-owned="youtube-home-video"]') ===
            null;
          if (firstConversion) {
            const childCount = feed.childNodes.length;
            if (childCount <= MAX_YOUTUBE_HOME_UNDO_CHILDREN) {
              previousChildren = Array.from(feed.childNodes);
            }
          }
        } catch {
          previousChildren = undefined;
        }

        applyYoutubeHomeAllowlist(feed, contentDocument);

        if (previousChildren === undefined) {
          return undefined;
        }
        const saved = previousChildren;
        return () => {
          try {
            if (!feed.isConnected) {
              return;
            }
            feed.replaceChildren(...saved);
          } catch {
            // Undo is best-effort on live Polymer hosts.
          }
        };
      } catch {
        return undefined;
      }
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

export function pageNeedsSurfaceRefresh(contentDocument: Document): boolean {
  for (const element of Array.from(
    contentDocument.querySelectorAll(
      `[data-prism-ad-slot], ${LIVE_AD_SLOT_SELECTOR}`,
    ),
  )) {
    if (element.querySelector("[data-prism-owned]") === null) {
      return true;
    }
  }

  const feed = findYoutubeHomeFeed(contentDocument);
  if (
    feed !== undefined &&
    youtubeHomeFeedChildren(feed).some(
      (child) => !isYoutubeHomeFeedChildOwned(child),
    )
  ) {
    return true;
  }

  const comments = contentDocument.querySelector(YOUTUBE_COMMENTS_SELECTOR);
  if (
    comments !== null &&
    comments.querySelector('[data-prism-owned="youtube-reddit-comments"]') ===
      null
  ) {
    return true;
  }

  if (searchPageHasWrappedLinks(contentDocument)) {
    return true;
  }

  if (redditFeedHasUnlabelledPosts(contentDocument)) {
    return true;
  }

  if (extractYoutubeAutoplay(contentDocument) !== null) {
    return true;
  }

  if (extractYoutubeEndScreens(contentDocument) !== null) {
    return true;
  }

  if (extractYoutubeMiniplayer(contentDocument) !== null) {
    return true;
  }

  return extractYoutubeIdlePrompt(contentDocument) !== null;
}

export interface WatchPageSurfacesOptions {
  readonly debounceMs?: number;
}

export function watchPageSurfaces(
  contentDocument: Document,
  onChange: () => void,
  options: WatchPageSurfacesOptions = {},
): () => void {
  const view = contentDocument.defaultView;
  if (view === null) {
    return () => {};
  }
  const debounceMs = options.debounceMs ?? 50;
  let cancelTimer = (): void => {};
  const MutationObserverCtor = view.MutationObserver;
  if (MutationObserverCtor === undefined) {
    return () => {};
  }

  const observer = new MutationObserverCtor(() => {
    if (!pageNeedsSurfaceRefresh(contentDocument)) {
      return;
    }
    cancelTimer();
    const handle = view.setTimeout(() => {
      if (pageNeedsSurfaceRefresh(contentDocument)) {
        onChange();
      }
    }, debounceMs);
    cancelTimer = () => {
      view.clearTimeout(handle);
    };
  });
  observer.observe(contentDocument, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    cancelTimer();
  };
}

export function waitForAdSlot(
  contentDocument: Document,
  timeoutMs: number = DEFAULT_AD_SLOT_WAIT_MS,
  signal?: AbortSignal,
): Promise<void> {
  return waitForSelector(
    contentDocument,
    `[data-prism-ad-slot], ${LIVE_AD_SLOT_SELECTOR}`,
    timeoutMs,
    signal,
  );
}

export function waitForYoutubeHomeFeed(
  contentDocument: Document,
  timeoutMs: number = DEFAULT_YOUTUBE_HOME_WAIT_MS,
  signal?: AbortSignal,
): Promise<void> {
  return waitForFeedRoot(
    () => findYoutubeHomeFeed(contentDocument),
    contentDocument,
    timeoutMs,
    signal,
  );
}

function waitForFeedRoot(
  locate: () => Element | undefined,
  contentDocument: Document,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }
  if (timeoutMs <= 0 || locate() !== undefined) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const view = contentDocument.defaultView;
    if (view === null) {
      resolve();
      return;
    }

    let settled = false;
    let observer: MutationObserver | undefined;

    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      observer?.disconnect();
      view.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error === undefined) {
        resolve();
        return;
      }
      reject(error);
    };

    const onAbort = (): void => {
      finish(createAbortError());
    };

    const MutationObserverCtor = view.MutationObserver;
    if (MutationObserverCtor !== undefined) {
      observer = new MutationObserverCtor(() => {
        if (locate() !== undefined) {
          finish();
        }
      });
      observer.observe(contentDocument, { childList: true, subtree: true });
    }

    const timer = view.setTimeout(() => finish(), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function waitForYoutubeCommentsSlot(
  contentDocument: Document,
  timeoutMs: number = DEFAULT_YOUTUBE_WATCH_WAIT_MS,
  signal?: AbortSignal,
): Promise<void> {
  return waitForSelector(
    contentDocument,
    YOUTUBE_COMMENTS_SELECTOR,
    timeoutMs,
    signal,
  );
}

export function waitForRedditFeed(
  contentDocument: Document,
  timeoutMs: number = DEFAULT_REDDIT_FEED_WAIT_MS,
  signal?: AbortSignal,
): Promise<void> {
  return waitForSelector(
    contentDocument,
    LIVE_REDDIT_FEED_SELECTOR,
    timeoutMs,
    signal,
  );
}

function waitForSelector(
  contentDocument: Document,
  selector: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }
  if (timeoutMs <= 0 || contentDocument.querySelector(selector) !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const view = contentDocument.defaultView;
    if (view === null) {
      resolve();
      return;
    }

    let settled = false;
    let observer: MutationObserver | undefined;

    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      observer?.disconnect();
      view.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error === undefined) {
        resolve();
        return;
      }
      reject(error);
    };

    const onAbort = (): void => {
      finish(createAbortError());
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

    const timer = view.setTimeout(() => finish(), timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function applyYoutubeHomeAllowlist(
  feed: Element,
  contentDocument: Document,
): void {
  ensureYoutubeHomeTileStyles(contentDocument);
  let passes = 0;
  while (passes < MAX_YOUTUBE_HOME_ALLOWLIST_PASSES) {
    passes += 1;
    const child = nextUnownedYoutubeHomeFeedChild(feed);
    if (child === undefined) {
      break;
    }
    if (!child.isConnected) {
      continue;
    }
    try {
      let videos: readonly YoutubeHomeVideo[] = [];
      try {
        videos = extractYoutubeHome(child).videos;
      } catch {
        videos = [];
      }
      if (!child.isConnected) {
        continue;
      }
      if (videos.length === 0) {
        safeRemoveFeedChild(child);
        continue;
      }
      const tiles = videos
        .map((video) => createYoutubeHomeTile(contentDocument, video))
        .filter((tile): tile is HTMLElement => tile !== null);
      if (!child.isConnected) {
        continue;
      }
      if (tiles.length === 0) {
        safeRemoveFeedChild(child);
        continue;
      }
      try {
        child.replaceWith(...tiles);
      } catch {
        if (child.isConnected) {
          safeRemoveFeedChild(child);
        }
      }
    } catch {
      if (child.isConnected) {
        safeRemoveFeedChild(child);
      }
    }
  }
  applyYoutubeHomeFeedLayout(feed);
}

function applyYoutubeHomeFeedLayout(feed: Element): void {
  try {
    if (feed.querySelector('[data-prism-owned="youtube-home-video"]') === null) {
      return;
    }
    applyYoutubeHomeGridContainer(feed);
    for (const row of Array.from(feed.querySelectorAll("ytd-rich-grid-row"))) {
      if (
        row.querySelector('[data-prism-owned="youtube-home-video"]') === null
      ) {
        continue;
      }
      if ("style" in row) {
        (row as HTMLElement).style.setProperty(
          "display",
          "contents",
          "important",
        );
      }
      const rowContents =
        row.querySelector(":scope > #contents") ??
        row.querySelector("#contents");
      if (rowContents instanceof Element) {
        applyYoutubeHomeGridContainer(rowContents);
      }
    }
  } catch {
    // Best-effort only.
  }
}

function applyYoutubeHomeGridContainer(container: Element): void {
  if (container.getAttribute("data-prism-youtube-home-grid") === "true") {
    return;
  }
  if (!("style" in container)) {
    return;
  }
  const element = container as HTMLElement;
  element.style.setProperty("display", "grid", "important");
  element.style.setProperty(
    "grid-template-columns",
    "repeat(auto-fill, minmax(280px, 1fr))",
    "important",
  );
  element.style.setProperty("column-gap", "16px", "important");
  element.style.setProperty("row-gap", "24px", "important");
  element.style.setProperty("width", "100%", "important");
  container.setAttribute("data-prism-youtube-home-grid", "true");
}

function nextUnownedYoutubeHomeFeedChild(feed: Element): Element | undefined {
  for (const child of youtubeHomeFeedChildren(feed)) {
    if (!child.isConnected) {
      continue;
    }
    if (!isYoutubeHomeFeedChildOwned(child)) {
      return child;
    }
  }
  return undefined;
}

function isYoutubeHomeFeedChildOwned(child: Element): boolean {
  const owned = child.getAttribute("data-prism-owned");
  return owned === "youtube-home-video" || owned === "youtube-home-hidden";
}

function safeRemoveFeedChild(child: Element): void {
  try {
    child.remove();
    return;
  } catch {
    // Fall through to hide when Polymer rejects removal.
  }
  try {
    child.setAttribute("hidden", "");
    if ("style" in child) {
      (child as HTMLElement).style.display = "none";
    }
    child.setAttribute("data-prism-owned", "youtube-home-hidden");
  } catch {
    // Best-effort only.
  }
}

function ensureYoutubeHomeTileStyles(contentDocument: Document): void {
  const root = contentDocument.head ?? contentDocument.documentElement;
  if (root === null) {
    return;
  }
  if (root.querySelector(`#${YOUTUBE_HOME_TILE_STYLE_ID}`) !== null) {
    return;
  }
  try {
    const style = contentDocument.createElement("style");
    style.id = YOUTUBE_HOME_TILE_STYLE_ID;
    style.dataset.prismOwned = "youtube-home-tiles";
    style.textContent = YOUTUBE_HOME_TILE_CSS;
    root.append(style);
  } catch {
    // Best-effort only.
  }
}

function createYoutubeHomeTile(
  contentDocument: Document,
  video: YoutubeHomeVideo,
): HTMLElement | null {
  if (
    video.id.trim() === "" ||
    !isValidYoutubeVideoId(video.id) ||
    video.title.trim() === "" ||
    video.href.trim() === ""
  ) {
    return null;
  }
  try {
    const tile = contentDocument.createElement("article");
    tile.dataset.prismOwned = "youtube-home-video";
    tile.dataset.videoId = video.id;

    const link = contentDocument.createElement("a");
    link.className = "prism-yt-home-card";
    link.href = video.href;

    const thumb = contentDocument.createElement("span");
    thumb.className = "prism-yt-home-thumb";
    const image = contentDocument.createElement("img");
    attachYoutubeHomeThumb(image, thumb, video);
    thumb.append(image);

    const title = contentDocument.createElement("span");
    title.className = "prism-yt-home-title";
    title.textContent = video.title;

    link.append(thumb, title);
    tile.append(link);
    return tile;
  } catch {
    return null;
  }
}

function isValidYoutubeVideoId(id: string): boolean {
  const trimmed = id.trim();
  return (
    trimmed.length >= 6 &&
    trimmed.length <= 32 &&
    /^[\w-]+$/u.test(trimmed)
  );
}

function attachYoutubeHomeThumb(
  image: HTMLImageElement,
  thumb: HTMLElement,
  video: YoutubeHomeVideo,
): void {
  const fallback = defaultYoutubeThumbnailUrl(video.id);
  const primary =
    video.thumbnailUrl?.trim() === "" || video.thumbnailUrl === undefined
      ? fallback
      : video.thumbnailUrl.trim();
  image.alt = "";
  image.loading = "eager";
  image.decoding = "async";
  image.referrerPolicy = "origin";
  image.src = primary;
  image.addEventListener("error", () => {
    if (image.src !== fallback) {
      image.src = fallback;
      return;
    }
    thumb.classList.add("prism-yt-home-thumb-missing");
    image.remove();
  });
}

export function applyCosmeticHides(
  contentDocument: Document,
  instructions: readonly CosmeticHideInstruction[],
  hostname: string,
): () => void {
  const cssText = cosmeticHideCss(instructions, hostname);
  if (cssText === "") {
    return () => {};
  }
  const style = contentDocument.createElement("style");
  style.dataset.prismOwned = "cosmetic";
  style.textContent = cssText;
  const root = contentDocument.head ?? contentDocument.documentElement;
  if (root === null) {
    throw new Error("Document root is not available");
  }
  root.append(style);
  return () => style.remove();
}

function applyActiveCosmeticHides(
  mods: readonly ActiveBundledMod[],
  options: ActivateContentModsOptions,
): void {
  if (options.contentDocument === undefined) {
    return;
  }
  let hostname: string;
  try {
    hostname = new URL(options.url).hostname;
  } catch {
    return;
  }
  for (const mod of mods) {
    if (mod.cosmetics === undefined || mod.cosmetics.length === 0) {
      continue;
    }
    options.undo.push(
      CONTENT_TAB_STACK,
      applyCosmeticHides(options.contentDocument, mod.cosmetics, hostname),
    );
  }
}

export function rememberImportedAssets(
  registry: Map<string, string> | undefined,
  mods: readonly ActiveBundledMod[],
): void {
  if (registry === undefined) {
    return;
  }
  registry.clear();
  for (const mod of mods) {
    for (const [asset, url] of Object.entries(mod.assetUrls ?? {})) {
      registry.set(`${mod.manifest.id}:${asset}`, url);
    }
  }
}

function isBundledExtensionEntry(entry: string | null): boolean {
  return entry !== null && entry.startsWith("bundled-mods/");
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function createAbortError(): Error {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
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

function readAdSlotMessage(
  content: Readonly<Record<string, unknown>>,
): string {
  if (typeof content.message !== "string" || content.message.trim() === "") {
    throw new Error("Ad slot hide message is invalid");
  }
  return content.message;
}

function readRemoteImageReplacement(
  content: Readonly<Record<string, unknown>>,
): { readonly contractId: string; readonly url: string; readonly alt: string } {
  if (
    typeof content.contractId !== "string" ||
    content.contractId.trim() === "" ||
    typeof content.url !== "string" ||
    content.url.trim() === "" ||
    typeof content.alt !== "string"
  ) {
    throw new Error("Remote image replacement payload is invalid");
  }
  return {
    contractId: content.contractId.trim(),
    url: content.url.trim(),
    alt: content.alt,
  };
}

function replaceAdSlotWithImage(
  contentDocument: Document,
  slot: AdSlotHandle,
  src: string,
  alt: string,
): () => void {
  const element = findAdSlot(contentDocument, slot);
  if (element === undefined) {
    throw new Error(`Ad slot ${slot.id} is not available`);
  }
  const footprint = measureAdSlotFootprint(element);
  const previousChildren = Array.from(element.childNodes);
  const image = contentDocument.createElement("img");
  image.dataset.prismOwned = "true";
  image.src = src;
  image.alt = alt;
  applyFootprintToImage(image, footprint);
  element.replaceChildren(image);

  return () => {
    if (image.parentNode === element) {
      element.replaceChildren(...previousChildren);
    }
  };
}

function replaceAdSlotWithRemoteImage(
  contentDocument: Document,
  slot: AdSlotHandle,
  manifest: PrismManifest,
  content: { readonly contractId: string; readonly url: string; readonly alt: string },
): () => void {
  const contract = manifest.egress?.contracts.find(
    (entry) => entry.id === content.contractId,
  );
  if (contract === undefined) {
    throw new Error(
      `Egress contract ${content.contractId} is not declared by ${manifest.id}`,
    );
  }
  if (!urlMatchesEgressContract(content.url, contract)) {
    throw new Error("Remote image URL is outside the declared egress contract");
  }
  return replaceAdSlotWithImage(
    contentDocument,
    slot,
    content.url,
    content.alt,
  );
}

function replaceAdSlotWithMessage(
  contentDocument: Document,
  slot: AdSlotHandle,
  message: string,
): () => void {
  const element = findAdSlot(contentDocument, slot);
  if (element === undefined) {
    throw new Error(`Ad slot ${slot.id} is not available`);
  }
  const previousChildren = Array.from(element.childNodes);
  const notice = contentDocument.createElement("p");
  notice.dataset.prismOwned = "true";
  notice.textContent = message;
  element.replaceChildren(notice);
  return () => {
    if (notice.parentNode === element) {
      element.replaceChildren(...previousChildren);
    }
  };
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

function readSponsorSegmentsExtraction(
  value: unknown,
): SponsorSegmentsExtraction {
  if (!isRecord(value) || !Array.isArray(value.segments)) {
    if (isRecord(value) && value.status === 403) {
      throw new Error("SponsorBlock search denied");
    }
    throw new Error("Invalid SponsorBlock segments response");
  }
  const segments: SponsorSegmentsExtraction["segments"][number][] = [];
  for (const segment of value.segments) {
    if (
      !isRecord(segment) ||
      typeof segment.category !== "string" ||
      typeof segment.actionType !== "string" ||
      typeof segment.start !== "number" ||
      typeof segment.end !== "number"
    ) {
      throw new Error("Invalid SponsorBlock segments response");
    }
    segments.push({
      category: segment.category,
      actionType: segment.actionType,
      start: segment.start,
      end: segment.end,
    });
  }
  return { segments };
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
  importedAssets: Map<string, string> = new Map(),
): PrismApiHandlers {
  return createContentHandlers(
    contentDocument,
    (modId, asset) =>
      importedAssets.get(`${modId}:${asset}`) ??
      runtime.getURL(
        `bundled-mods/${encodeURIComponent(modId)}/${asset}`,
      ),
    (message) => runtime.sendMessage<BrokeredResponse>(message),
    (message) => runtime.sendMessage<unknown>(message),
    (message) => runtime.sendMessage<unknown>(message),
  );
}

if (typeof chrome !== "undefined") {
  const undo = new TabUndoStack();
  const importedAssets = new Map<string, string>();
  const pasteGuard = installPasteAllowGuard(document, true);
  const popupSuppressGuard = installPopupSuppressGuard(
    document.defaultView ?? (globalThis as unknown as Window),
    true,
  );
  const titleFreezeGuard = installTitleFreezeGuard(document, true);
  const scrollLockGuard = installScrollLockGuard(document, true);
  const overlaySuppressGuard = installOverlaySuppressGuard(document, true);
  const consentRejectGuard = installConsentRejectGuard(document, true);
  const autoplayGuard = installAutoplayGuard(document, true);
  let lastContextElement: Element | null = null;
  document.addEventListener(
    "contextmenu",
    (event) => {
      lastContextElement =
        event.target instanceof Element ? event.target : null;
    },
    true,
  );

  async function loadElementHides(): Promise<void> {
    const response = await chrome.runtime.sendMessage<{
      readonly selectors?: readonly string[];
    }>({
      type: "get-element-hides",
      url: globalThis.location.href,
    });
    applyPersistedHideRules(document, response.selectors ?? []);
  }

  const session = createContentSession({
    requestActiveMods: (url) =>
      chrome.runtime.sendMessage<ActiveModsResponse>({
        type: "active-mods",
        url,
      }),
    loadEntry: async (entry) => {
      try {
        return (await import(
          chrome.runtime.getURL(entry)
        )) as ContentModModule;
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to load bundled mod ${entry}: ${detail}`);
      }
    },
    handlers: createChromeContentHandlers(
      document,
      chrome.runtime,
      importedAssets,
    ),
    undo,
    contentDocument: document,
    importedAssets,
    emit: (event) =>
      chrome.runtime.sendMessage({ type: "activity-event", event }),
    reportLoadOutcomes: (states, url) =>
      reportModLoadOutcomes(states, url, (message) =>
        chrome.runtime.sendMessage(message),
      ),
  });

  async function syncBehaviourPolicies(url: string): Promise<void> {
    try {
      const response = await chrome.runtime.sendMessage<{
        readonly paste?: { readonly allow?: boolean };
        readonly "popup-suppress"?: { readonly allow?: boolean };
        readonly "title-freeze"?: { readonly allow?: boolean };
        readonly "scroll-lock"?: { readonly allow?: boolean };
        readonly "overlay-suppress"?: { readonly allow?: boolean };
        readonly "consent-reject"?: { readonly allow?: boolean };
        readonly autoplay?: { readonly allow?: boolean };
      }>({
        type: "get-behaviour-policies",
        url,
      });
      if (typeof response.paste?.allow === "boolean") {
        pasteGuard.setAllowed(response.paste.allow);
      }
      if (typeof response["popup-suppress"]?.allow === "boolean") {
        popupSuppressGuard.setActive(response["popup-suppress"].allow);
      }
      if (typeof response["title-freeze"]?.allow === "boolean") {
        titleFreezeGuard.setActive(response["title-freeze"].allow);
      }
      if (typeof response["scroll-lock"]?.allow === "boolean") {
        scrollLockGuard.setActive(response["scroll-lock"].allow);
      }
      if (typeof response["overlay-suppress"]?.allow === "boolean") {
        overlaySuppressGuard.setActive(response["overlay-suppress"].allow);
      }
      if (typeof response["consent-reject"]?.allow === "boolean") {
        consentRejectGuard.setActive(response["consent-reject"].allow);
      }
      if (typeof response.autoplay?.allow === "boolean") {
        autoplayGuard.setActive(response.autoplay.allow);
      }
    } catch {
      pasteGuard.setAllowed(true);
      popupSuppressGuard.setActive(true);
      titleFreezeGuard.setActive(true);
      scrollLockGuard.setActive(true);
      overlaySuppressGuard.setActive(true);
      consentRejectGuard.setActive(true);
      autoplayGuard.setActive(true);
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "hide-element") {
      if (lastContextElement === null) {
        sendResponse({ ok: false });
        return undefined;
      }
      const target = lastContextElement;
      if (message.persist === true) {
        const selector = cssSelectorForElement(target);
        if (selector === undefined || hideRuleCss(selector) === undefined) {
          sendResponse({ ok: false });
          return undefined;
        }
        if (applySessionHide(target)) {
          undo.push(CONTENT_TAB_STACK, () => {
            restoreSessionHide(target);
          });
        }
        void chrome.runtime
          .sendMessage({
            type: "add-element-hide",
            origin: globalThis.location.origin,
            selector,
          })
          .then(() => loadElementHides());
        sendResponse({ ok: true });
        return undefined;
      }
      if (applySessionHide(target)) {
        undo.push(CONTENT_TAB_STACK, () => {
          restoreSessionHide(target);
        });
        sendResponse({ ok: true });
        return undefined;
      }
      sendResponse({ ok: false });
      return undefined;
    }
    if (message.type === "pause-prism-here") {
      void chrome.runtime
        .sendMessage({
          type: "report-runtime-pause",
          origin: globalThis.location.origin,
        })
        .then(() => session.run(globalThis.location.href))
        .then(
          () => sendResponse({ ok: true }),
          () => sendResponse({ ok: false }),
        );
      return true;
    }
    if (message.type === "url-changed" && message.url !== undefined) {
      void session.run(message.url).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false }),
      );
      void syncBehaviourPolicies(message.url);
      return true;
    }
    if (
      message.type === "paste-policy" ||
      message.type === "behaviour-policies"
    ) {
      if (message.type === "paste-policy" && typeof message.allow === "boolean") {
        pasteGuard.setAllowed(message.allow);
        sendResponse({ ok: true });
        return undefined;
      }
      void syncBehaviourPolicies(globalThis.location.href).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false }),
      );
      return true;
    }
    sendResponse(handleContentMessage(message, undo, session.activeModIds));
    return undefined;
  });
  watchSpaNavigation({
    getHref: () => globalThis.location.href,
    onNavigate: (href) => {
      void session.run(href).catch(() => undefined);
      void syncBehaviourPolicies(href).catch(() => undefined);
      void loadElementHides().catch(() => undefined);
    },
    history: globalThis.history,
    target: globalThis,
  });
  watchPageSurfaces(document, () => {
    void session.refresh(globalThis.location.href).catch(() => undefined);
  });
  void session.run(globalThis.location.href).catch(() => undefined);
  void syncBehaviourPolicies(globalThis.location.href);
  void loadElementHides().catch(() => undefined);
}
