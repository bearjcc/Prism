import { querySelectorDeep } from "./dom-query.js";

export const FIXTURE_YOUTUBE_COMMENTS_SLOT_SELECTOR =
  '[data-prism-comments-slot="youtube-comments"]';

export const LIVE_YOUTUBE_COMMENTS_SLOT_SELECTORS = [
  "ytd-comments#comments",
  "ytd-comments#sections",
  "ytd-comments",
  "ytd-item-section-renderer[target-id=\"comments-section\"]",
  'ytd-item-section-renderer[section-identifier="comment-item-section"]',
  "ytd-engagement-panel-section-list-renderer[target-id=\"engagement-panel-comments-section\"]",
] as const;

export const LIVE_YOUTUBE_COMMENTS_FALLBACK_HOST_SELECTORS = [
  "#secondary #secondary-inner",
  "#secondary ytd-watch-next-secondary-results-renderer",
  "#secondary",
  "ytd-watch-flexy #secondary",
] as const;

export function youtubeCommentsSlotSelectorList(): readonly string[] {
  return [
    FIXTURE_YOUTUBE_COMMENTS_SLOT_SELECTOR,
    ...LIVE_YOUTUBE_COMMENTS_SLOT_SELECTORS,
  ];
}

export function findYoutubeCommentsSlot(root: ParentNode): Element | undefined {
  const fixture = querySelectorDeep(root, FIXTURE_YOUTUBE_COMMENTS_SLOT_SELECTOR);
  if (fixture !== undefined) {
    return fixture;
  }
  for (const selector of LIVE_YOUTUBE_COMMENTS_SLOT_SELECTORS) {
    const match = querySelectorDeep(root, selector);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

export function findYoutubeCommentsFallbackHost(
  root: ParentNode,
): Element | undefined {
  for (const selector of LIVE_YOUTUBE_COMMENTS_FALLBACK_HOST_SELECTORS) {
    const match = querySelectorDeep(root, selector);
    if (match !== undefined) {
      return match;
    }
  }
  return undefined;
}

export function isYoutubeWatchUrl(pageUrl: string): boolean {
  try {
    const url = new URL(pageUrl);
    return url.hostname === "www.youtube.com" && url.pathname === "/watch";
  } catch {
    return false;
  }
}

export function watchPageNeedsCommentsMount(
  root: ParentNode,
  pageUrl: string,
): boolean {
  if (!isYoutubeWatchUrl(pageUrl)) {
    return false;
  }
  if (
    querySelectorDeep(root, '[data-prism-owned="youtube-reddit-comments"]') !==
    undefined
  ) {
    return false;
  }
  const slot = findYoutubeCommentsSlot(root);
  if (slot !== undefined) {
    return (
      slot.querySelector('[data-prism-owned="youtube-reddit-comments"]') === null
    );
  }
  return querySelectorDeep(root, "ytd-watch-flexy") !== undefined;
}
