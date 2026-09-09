import { querySelectorAllDeep, querySelectorDeep } from "./dom-query.js";

export type LinkedinHomeReason =
  | "first-degree"
  | "followed-page"
  | "extended-network"
  | "promoted"
  | "activity-reshare"
  | "module"
  | "unknown";

export interface LinkedinHomeItem {
  readonly id: string;
  readonly title?: string;
  readonly href?: string;
  readonly allowlisted: boolean;
  readonly reason: LinkedinHomeReason;
}

export interface LinkedinHomeExtraction {
  readonly items: readonly LinkedinHomeItem[];
}

const FEED_ROOT_SELECTOR = [
  "[data-linkedin-home-feed]",
  ".scaffold-finite-scroll__content",
].join(", ");

const FEED_ITEM_SELECTOR = [
  '[data-view-name="feed-full-update"]',
  '[data-view-name="pymk-module"]',
  '[data-view-name="jobs-module"]',
  '[data-view-name="news-module"]',
  "section[data-fixture-kind='module']",
].join(", ");

const ACTOR_SELECTOR = ".update-components-actor";
const ACTOR_NAME_SELECTOR = ".update-components-actor__name";
const ACTOR_BADGE_SELECTOR = [
  ".update-components-actor__supplementary-actor-info",
  ".update-components-actor__meta-link",
].join(", ");
const ACTIVITY_HEADER_SELECTOR = ".update-components-header__text-view";

const MODULE_VIEW_NAMES = new Set([
  "pymk-module",
  "jobs-module",
  "news-module",
  "newsletter-module",
]);

const MODULE_HEADINGS = [
  /people you may know/iu,
  /jobs for you/iu,
  /linkedin news/iu,
  /newsletter/iu,
];

const ACTIVITY_HEADER_PATTERN =
  /\b(?:commented on|likes this|liked this|reposted|shared (?:this|a post))\b/iu;

const PROMOTED_PATTERN = /\b(?:promoted|sponsored)\b/iu;

const FIRST_DEGREE_PATTERN = /\b1st\b/iu;
const EXTENDED_NETWORK_PATTERN = /\b(?:2nd|3rd\+?|3rd)\b/iu;

export function findLinkedinHomeFeed(root: ParentNode): Element | undefined {
  try {
    const pathname = readPathname(root);
    if (pathname !== undefined && !isLinkedinFeedPath(pathname)) {
      return undefined;
    }
    const feed = querySelectorDeep(root, FEED_ROOT_SELECTOR);
    if (feed === undefined) {
      return undefined;
    }
    return feedHasItems(feed) ? feed : undefined;
  } catch {
    return undefined;
  }
}

export function linkedinHomeFeedChildren(feed: Element): Element[] {
  try {
    return Array.from(feed.children).filter(
      (child): child is Element =>
        typeof child === "object" &&
        child !== null &&
        "tagName" in child &&
        typeof (child as Element).getAttribute === "function",
    );
  } catch {
    return [];
  }
}

export function linkedinHomeFeedHasUnlabelledPosts(feed: Element): boolean {
  try {
    return linkedinHomeFeedChildren(feed).some(
      (child) =>
        child.isConnected &&
        child.getAttribute("data-prism-owned") !== "linkedin-home-kept" &&
        child.getAttribute("data-prism-owned") !== "linkedin-home-hidden",
    );
  } catch {
    return false;
  }
}

export function classifyLinkedinHomeItem(element: Element): LinkedinHomeItem {
  try {
    const id = readItemId(element);
    const title = readItemTitle(element);
    const href = readItemHref(element);
    const reason = classifyReason(element);
    return {
      id,
      ...(title === undefined ? {} : { title }),
      ...(href === undefined ? {} : { href }),
      allowlisted:
        reason === "first-degree" || reason === "followed-page",
      reason,
    };
  } catch {
    return {
      id: "unknown",
      allowlisted: false,
      reason: "unknown",
    };
  }
}

export function extractLinkedinHome(root: ParentNode): LinkedinHomeExtraction {
  try {
    const feed = findLinkedinHomeFeed(root);
    if (feed === undefined) {
      return { items: [] };
    }
    const items = linkedinHomeFeedChildren(feed).map((child) =>
      classifyLinkedinHomeItem(child),
    );
    return { items };
  } catch {
    return { items: [] };
  }
}

function classifyReason(element: Element): LinkedinHomeReason {
  if (isModule(element)) {
    return "module";
  }
  if (isPromoted(element)) {
    return "promoted";
  }
  if (isActivityCard(element)) {
    const underlying = findUnderlyingAuthor(element);
    if (underlying !== undefined) {
      const underlyingReason = classifyAuthorReason(underlying);
      if (underlyingReason === "first-degree" || underlyingReason === "followed-page") {
        return underlyingReason;
      }
      return "activity-reshare";
    }
    return "activity-reshare";
  }
  const authorReason = classifyAuthorReason(element);
  if (authorReason !== "unknown") {
    return authorReason;
  }
  return "unknown";
}

function classifyAuthorReason(scope: Element): LinkedinHomeReason {
  const badgeText = readBadgeText(scope);
  if (FIRST_DEGREE_PATTERN.test(badgeText)) {
    return "first-degree";
  }
  if (EXTENDED_NETWORK_PATTERN.test(badgeText)) {
    return "extended-network";
  }
  if (isPromoted(scope)) {
    return "promoted";
  }
  if (readActorName(scope) !== undefined) {
    return "followed-page";
  }
  return "unknown";
}

function isModule(element: Element): boolean {
  const viewName = element.getAttribute("data-view-name") ?? "";
  if (MODULE_VIEW_NAMES.has(viewName)) {
    return true;
  }
  if (element.getAttribute("data-fixture-kind") === "module") {
    return true;
  }
  const heading = element.textContent ?? "";
  return MODULE_HEADINGS.some((pattern) => pattern.test(heading));
}

function isPromoted(element: Element): boolean {
  const text = collectText(element);
  return PROMOTED_PATTERN.test(text);
}

function isActivityCard(element: Element): boolean {
  try {
    for (const header of querySelectorAllDeep(element, ACTIVITY_HEADER_SELECTOR)) {
      const text = header.textContent ?? "";
      if (ACTIVITY_HEADER_PATTERN.test(text)) {
        return true;
      }
    }
    const text = element.textContent ?? "";
    return ACTIVITY_HEADER_PATTERN.test(text);
  } catch {
    return false;
  }
}

function findUnderlyingAuthor(element: Element): Element | undefined {
  try {
    const actors = querySelectorAllDeep(element, ACTOR_SELECTOR);
    return actors.at(-1);
  } catch {
    return undefined;
  }
}

function readBadgeText(scope: Element): string {
  try {
    for (const selector of ACTOR_BADGE_SELECTOR.split(", ")) {
      for (const badge of querySelectorAllDeep(scope, selector)) {
        const text = badge.textContent?.trim() ?? "";
        if (text.length > 0) {
          return text;
        }
      }
    }
    return "";
  } catch {
    return "";
  }
}

function readActorName(scope: Element): string | undefined {
  try {
    const name = querySelectorDeep(scope, ACTOR_NAME_SELECTOR);
    const text = name?.textContent?.trim() ?? "";
    return text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function readItemId(element: Element): string {
  const urn = element.getAttribute("data-urn");
  if (urn !== null && urn.trim() !== "") {
    return urn.trim();
  }
  const kind = element.getAttribute("data-fixture-kind");
  if (kind !== null && kind.trim() !== "") {
    return `fixture:${kind.trim()}`;
  }
  const viewName = element.getAttribute("data-view-name");
  if (viewName !== null && viewName.trim() !== "") {
    return `view:${viewName.trim()}`;
  }
  return "unknown";
}

function readItemTitle(element: Element): string | undefined {
  try {
    const description = querySelectorDeep(
      element,
      ".feed-shared-update-v2__description",
    );
    const text = description?.textContent?.trim() ?? readActorName(element);
    return text && text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function readItemHref(element: Element): string | undefined {
  try {
    const link = querySelectorDeep(element, "a[href]");
    const href = link?.getAttribute("href")?.trim() ?? "";
    return href.length > 0 ? href : undefined;
  } catch {
    return undefined;
  }
}

function collectText(element: Element): string {
  try {
    return element.textContent ?? "";
  } catch {
    return "";
  }
}

function feedHasItems(feed: Element): boolean {
  try {
    if (feed.children.length > 0) {
      return true;
    }
    return querySelectorDeep(feed, FEED_ITEM_SELECTOR) !== undefined;
  } catch {
    return false;
  }
}

function readPathname(root: ParentNode): string | undefined {
  try {
    const document = ownerDocument(root);
    return document?.location?.pathname;
  } catch {
    return undefined;
  }
}

function ownerDocument(node: ParentNode): Document | undefined {
  if (
    "location" in node &&
    typeof (node as Document).location?.pathname === "string"
  ) {
    return node as Document;
  }
  if ("ownerDocument" in node && node.ownerDocument !== null) {
    return node.ownerDocument;
  }
  return undefined;
}

export function isLinkedinFeedPath(pathname: string): boolean {
  const normalised = pathname.replace(/\/+$/u, "") || "/";
  return normalised === "/feed" || normalised.startsWith("/feed/");
}
