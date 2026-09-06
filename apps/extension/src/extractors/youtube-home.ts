import { querySelectorAllDeep } from "./dom-query.js";

export interface YoutubeHomeVideo {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly thumbnailUrl?: string;
}

export interface YoutubeHomeExtraction {
  readonly videos: readonly YoutubeHomeVideo[];
}

const VIDEO_CARD_SELECTOR = [
  "ytd-rich-item-renderer",
  "ytd-grid-video-renderer",
  "ytd-video-renderer",
].join(",");

const NON_VIDEO_SELECTOR = [
  "ytd-ad-slot-renderer",
  "ytd-promoted-sparkles-web-renderer",
  "ytd-rich-section-renderer",
  "ytd-rich-shelf-renderer",
  "ytd-reel-shelf-renderer",
  "ytd-backstage-post-thread-renderer",
  "ytd-post-renderer",
  "ytd-poll-renderer",
  "ytd-display-ad-renderer",
  "ytd-in-feed-ad-layout-renderer",
  "ytd-inline-survey-renderer",
  "ytd-continuation-item-renderer",
  "ytd-banner-promo-renderer",
  "ytd-promoted-video-renderer",
  "ytd-rich-card-renderer",
  "ytd-game-card-renderer",
  "ytd-playables-renderer",
  "ytd-feed-nudge-renderer",
  "grid-shelf-view-model",
].join(",");

const SHORTS_SELECTOR = [
  "ytd-rich-grid-slim-media",
  "ytd-shorts-lockup-view-model",
  "ytm-shorts-lockup-view-model",
  "ytm-shorts-lockup-view-model-v2",
].join(",");

const VIDEO_TITLE_LINK_SELECTOR = [
  'a[id="video-title-link"][href]',
  'a[id="video-title"][href]',
  "a.ytLockupMetadataViewModelTitle[href]",
  "a.yt-lockup-metadata-view-model__title[href]",
].join(",");

const VIDEO_THUMBNAIL_LINK_SELECTOR = [
  'a#thumbnail[href*="watch?v="]',
  'a.ytLockupViewModelContentImage[href*="watch?v="]',
  'a.yt-lockup-view-model__content-image[href*="watch?v="]',
].join(",");

const HOME_FEED_SELECTOR = [
  "ytd-rich-grid-renderer #contents",
  "ytd-rich-grid-renderer > #contents",
].join(", ");

const HOME_SEARCH_ROOT_SELECTOR = [
  'ytd-browse[page-subtype="home"]',
  "ytd-two-column-browse-results-renderer",
  "ytd-app",
].join(", ");

const HOME_FEED_ITEM_SELECTOR = [
  "ytd-rich-item-renderer",
  "ytd-rich-section-renderer",
  "ytd-rich-grid-row",
  "ytd-rich-shelf-renderer",
  "ytd-in-feed-ad-layout-renderer",
  "ytd-continuation-item-renderer",
  "grid-shelf-view-model",
].join(", ");

export function defaultYoutubeThumbnailUrl(videoId: string): string {
  const id = videoId.trim();
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

export function extractYoutubeHome(root: ParentNode): YoutubeHomeExtraction {
  try {
    const videos: YoutubeHomeVideo[] = [];
    const seen = new Set<string>();

    for (const card of youtubeHomeCards(root)) {
      if (!isVideoCard(card)) {
        continue;
      }
      const item = videoFromCard(card);
      if (item === undefined || seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      videos.push(item);
    }

    return { videos };
  } catch {
    return { videos: [] };
  }
}

function youtubeHomeCards(root: ParentNode): Element[] {
  try {
    const descendants = Array.from(root.querySelectorAll(VIDEO_CARD_SELECTOR));
    if (isElement(root) && root.matches(VIDEO_CARD_SELECTOR)) {
      return [root, ...descendants.filter((card) => card !== root)];
    }
    return descendants;
  } catch {
    return [];
  }
}

function isElement(node: ParentNode): node is Element {
  return "matches" in node && typeof node.matches === "function";
}

export function findYoutubeHomeFeed(root: ParentNode): Element | undefined {
  const searchRoots = homeSearchRoots(root);
  const candidates: Element[] = [];
  for (const searchRoot of searchRoots) {
    for (const selector of HOME_FEED_SELECTOR.split(", ")) {
      for (const feed of querySelectorAllDeep(searchRoot, selector)) {
        candidates.push(feed);
      }
      if (
        searchRoot === root ||
        typeof (
          searchRoot as ParentNode & { querySelector?: unknown }
        ).querySelector === "function"
      ) {
        const feed = (
          searchRoot as ParentNode & {
            querySelector: (value: string) => Element | null;
          }
        ).querySelector(selector);
        if (feed !== null) {
          candidates.push(feed);
        }
      }
    }
  }
  const unique = [...new Set(candidates)];
  if (unique.length === 0) {
    return undefined;
  }
  return (
    unique.find((feed) => feedHasHomeItems(feed)) ??
    unique.find((feed) => feed.children.length > 0) ??
    unique[0]
  );
}

export function youtubeHomeFeedChildren(feed: Element): Element[] {
  const children: Element[] = [];
  for (const child of Array.from(feed.children)) {
    if (child.tagName.toLowerCase() === "ytd-rich-grid-row") {
      const rowContents =
        child.querySelector(":scope > #contents") ??
        child.querySelector("#contents") ??
        child;
      for (const item of Array.from(rowContents.children)) {
        children.push(item);
      }
      continue;
    }
    children.push(child);
  }
  return children;
}

function homeSearchRoots(root: ParentNode): ParentNode[] {
  const roots: ParentNode[] = [];
  for (const selector of HOME_SEARCH_ROOT_SELECTOR.split(", ")) {
    for (const match of querySelectorAllDeep(root, selector)) {
      roots.push(match);
    }
  }
  return roots.length > 0 ? roots : [root];
}

function feedHasHomeItems(feed: Element): boolean {
  try {
    return feed.querySelector(HOME_FEED_ITEM_SELECTOR) !== null;
  } catch {
    return false;
  }
}

function isVideoCard(card: Element): boolean {
  try {
    if (isShortsCard(card)) {
      return false;
    }
    if (
      card.closest(NON_VIDEO_SELECTOR) !== null ||
      card.querySelector(NON_VIDEO_SELECTOR) !== null
    ) {
      return false;
    }
    if (!card.matches("ytd-rich-item-renderer")) {
      return true;
    }
    return (
      card.querySelector("ytd-rich-grid-media") !== null ||
      card.querySelector("yt-lockup-view-model") !== null
    );
  } catch {
    return false;
  }
}

function isShortsCard(card: Element): boolean {
  try {
    if (card.matches('ytd-rich-item-renderer[is-slim-media]')) {
      return true;
    }
    if (card.querySelector(SHORTS_SELECTOR) !== null) {
      return true;
    }
    const shortsLink = card.querySelector('a[href*="/shorts/"]');
    if (shortsLink === null) {
      return false;
    }
    return card.querySelector('a[href*="/watch?v="]') === null;
  } catch {
    return false;
  }
}

function videoFromCard(card: Element): YoutubeHomeVideo | undefined {
  try {
    const titleLink = card.querySelector<HTMLAnchorElement>(
      VIDEO_TITLE_LINK_SELECTOR,
    );
    if (titleLink !== null) {
      const fromTitle = videoFromLink(titleLink);
      if (fromTitle !== undefined) {
        return withThumbnail(fromTitle, thumbnailFromCard(card));
      }
    }
    const thumbnailLink = card.querySelector<HTMLAnchorElement>(
      VIDEO_THUMBNAIL_LINK_SELECTOR,
    );
    if (thumbnailLink === null) {
      return undefined;
    }
    const fromThumbnail = videoFromLink(thumbnailLink);
    if (fromThumbnail === undefined) {
      return undefined;
    }
    if (fromThumbnail.title !== "") {
      return withThumbnail(fromThumbnail, thumbnailFromCard(card));
    }
    const title =
      titleLink?.getAttribute("title") ??
      titleLink?.getAttribute("aria-label") ??
      titleLink?.textContent ??
      fromThumbnail.id;
    return withThumbnail(
      { ...fromThumbnail, title: normalizeText(title) },
      thumbnailFromCard(card),
    );
  } catch {
    return undefined;
  }
}

function withThumbnail(
  video: YoutubeHomeVideo,
  thumbnailUrl?: string,
): YoutubeHomeVideo {
  if (thumbnailUrl === undefined || thumbnailUrl === "") {
    return video;
  }
  return { ...video, thumbnailUrl };
}

function thumbnailFromCard(card: Element): string | undefined {
  try {
    for (const img of Array.from(card.querySelectorAll("img[src]"))) {
      const raw = img.getAttribute("src")?.trim();
      if (raw === undefined || raw === "") {
        continue;
      }
      if (raw.startsWith("data:")) {
        continue;
      }
      if (raw.startsWith("//")) {
        return `https:${raw}`;
      }
      if (raw.startsWith("http://") || raw.startsWith("https://")) {
        return raw;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function videoFromLink(link: HTMLAnchorElement): YoutubeHomeVideo | undefined {
  const href = link.getAttribute("href")?.trim();
  if (href === undefined || href === "") {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(href, "https://www.youtube.com");
  } catch {
    return undefined;
  }
  if (url.hostname !== "youtube.com" && url.hostname !== "www.youtube.com") {
    return undefined;
  }
  const id = url.pathname === "/watch" ? url.searchParams.get("v")?.trim() : "";
  const title = normalizeText(
    link.getAttribute("title") ??
      link.getAttribute("aria-label") ??
      link.textContent ??
      "",
  );
  if (id === undefined || id === "" || title === "") {
    return undefined;
  }

  return { id, title, href: url.href };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
