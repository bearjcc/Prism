export interface YoutubeHomeVideo {
  readonly id: string;
  readonly title: string;
  readonly href: string;
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
  'ytd-browse[page-subtype="home"] ytd-rich-grid-renderer #contents',
  "ytd-rich-grid-renderer #contents",
].join(", ");

export function extractYoutubeHome(root: ParentNode): YoutubeHomeExtraction {
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
}

function youtubeHomeCards(root: ParentNode): Element[] {
  const descendants = Array.from(root.querySelectorAll(VIDEO_CARD_SELECTOR));
  if (isElement(root) && root.matches(VIDEO_CARD_SELECTOR)) {
    return [root, ...descendants.filter((card) => card !== root)];
  }
  return descendants;
}

function isElement(node: ParentNode): node is Element {
  return "matches" in node && typeof node.matches === "function";
}

export function findYoutubeHomeFeed(root: ParentNode): Element | undefined {
  for (const selector of HOME_FEED_SELECTOR.split(", ")) {
    const feed = root.querySelector(selector);
    if (feed !== null) {
      return feed;
    }
  }
  return undefined;
}

function isVideoCard(card: Element): boolean {
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
}

function isShortsCard(card: Element): boolean {
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
}

function videoFromCard(card: Element): YoutubeHomeVideo | undefined {
  const titleLink = card.querySelector<HTMLAnchorElement>(
    VIDEO_TITLE_LINK_SELECTOR,
  );
  if (titleLink !== null) {
    const fromTitle = videoFromLink(titleLink);
    if (fromTitle !== undefined) {
      return fromTitle;
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
    return fromThumbnail;
  }
  const title =
    titleLink?.getAttribute("title") ??
    titleLink?.getAttribute("aria-label") ??
    titleLink?.textContent ??
    fromThumbnail.id;
  return { ...fromThumbnail, title: normalizeText(title) };
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
