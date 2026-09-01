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
].join(",");

const VIDEO_TITLE_LINK_SELECTOR = [
  'a[id="video-title-link"][href]',
  'a[id="video-title"][href]',
].join(",");

export function extractYoutubeHome(root: ParentNode): YoutubeHomeExtraction {
  const videos: YoutubeHomeVideo[] = [];
  const seen = new Set<string>();

  for (const card of youtubeHomeCards(root)) {
    if (!isVideoCard(card)) {
      continue;
    }
    const link = card.querySelector<HTMLAnchorElement>(
      VIDEO_TITLE_LINK_SELECTOR,
    );
    const item = link === null ? undefined : videoFromLink(link);
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
  return (
    root.querySelector("ytd-rich-grid-renderer #contents") ?? undefined
  );
}

function isVideoCard(card: Element): boolean {
  if (
    card.closest(NON_VIDEO_SELECTOR) !== null ||
    card.querySelector(NON_VIDEO_SELECTOR) !== null
  ) {
    return false;
  }
  return (
    !card.matches("ytd-rich-item-renderer") ||
    card.querySelector("ytd-rich-grid-media") !== null
  );
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
  const title = (
    link.getAttribute("title") ??
    link.getAttribute("aria-label") ??
    link.textContent ??
    ""
  )
    .replace(/\s+/gu, " ")
    .trim();
  if (id === undefined || id === "" || title === "") {
    return undefined;
  }

  return { id, title, href: url.href };
}
