import { querySelectorAllDeep, querySelectorDeep } from "./dom-query.js";

export type FacebookHomeReason =
  | "friend"
  | "sponsored"
  | "suggested"
  | "page"
  | "group"
  | "module"
  | "activity-reshare"
  | "unknown";

export interface FacebookHomeItem {
  readonly id: string;
  readonly title?: string;
  readonly href?: string;
  readonly allowlisted: boolean;
  readonly reason: FacebookHomeReason;
}

export interface FacebookHomeExtraction {
  readonly items: readonly FacebookHomeItem[];
}

const FEED_ROOT_SELECTOR = [
  "[data-facebook-home-feed]",
  '[role="feed"]',
].join(", ");

const FEED_ITEM_SELECTOR = [
  '[role="article"]',
  '[role="region"][data-fixture-kind="module"]',
  "section[data-fixture-kind='module']",
].join(", ");

const AUTHOR_SELECTOR = ".fb-feed-author";
const AUTHOR_NAME_SELECTOR = ".fb-author-name";
const ACTIVITY_HEADER_SELECTOR = ".fb-activity-header";

const MODULE_HEADINGS = [
  /people you may know/iu,
  /reels(?:\s+for you)?/iu,
  /suggested reels/iu,
];

const ACTIVITY_HEADER_PATTERN =
  /\b(?:shared (?:this|a post)|commented on|likes this|liked this)\b/iu;

const SPONSORED_PATTERN = /\b(?:sponsored|ad)\b/iu;
const SUGGESTED_PATTERN = /\bsuggested for you\b/iu;
const GROUP_PATTERN = /\b(?:posted in|shared (?:to|with) .+ group)\b/iu;
const FRIEND_PATTERN = /\bfriends?\b/iu;

export function findFacebookHomeFeed(root: ParentNode): Element | undefined {
  try {
    const pathname = readPathname(root);
    if (pathname !== undefined && !isFacebookHomePath(pathname)) {
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

export function facebookHomeFeedChildren(feed: Element): Element[] {
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

export function facebookHomeFeedHasUnlabelledPosts(feed: Element): boolean {
  try {
    return facebookHomeFeedChildren(feed).some(
      (child) =>
        child.isConnected &&
        child.getAttribute("data-prism-owned") !== "facebook-home-kept" &&
        child.getAttribute("data-prism-owned") !== "facebook-home-hidden",
    );
  } catch {
    return false;
  }
}

export function classifyFacebookHomeItem(element: Element): FacebookHomeItem {
  try {
    const id = readItemId(element);
    const title = readItemTitle(element);
    const href = readItemHref(element);
    const reason = classifyReason(element);
    return {
      id,
      ...(title === undefined ? {} : { title }),
      ...(href === undefined ? {} : { href }),
      allowlisted: reason === "friend",
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

export function extractFacebookHome(root: ParentNode): FacebookHomeExtraction {
  try {
    const feed = findFacebookHomeFeed(root);
    if (feed === undefined) {
      return { items: [] };
    }
    const items = facebookHomeFeedChildren(feed).map((child) =>
      classifyFacebookHomeItem(child),
    );
    return { items };
  } catch {
    return { items: [] };
  }
}

function classifyReason(element: Element): FacebookHomeReason {
  if (isModule(element)) {
    return "module";
  }
  if (isSponsored(element)) {
    return "sponsored";
  }
  if (isSuggested(element)) {
    return "suggested";
  }
  if (isGroupPost(element)) {
    return "group";
  }
  if (isActivityCard(element)) {
    const underlying = findUnderlyingAuthor(element);
    if (underlying !== undefined) {
      const underlyingReason = classifyAuthorReason(underlying);
      if (underlyingReason === "friend") {
        return "friend";
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

function classifyAuthorReason(scope: Element): FacebookHomeReason {
  if (isPageAuthor(scope)) {
    return "page";
  }
  if (isSponsored(scope)) {
    return "sponsored";
  }
  if (isSuggested(scope)) {
    return "suggested";
  }
  if (isGroupPost(scope)) {
    return "group";
  }
  if (isFriendAuthor(scope)) {
    return "friend";
  }
  return "unknown";
}

function isModule(element: Element): boolean {
  const role = element.getAttribute("role") ?? "";
  if (role === "region" && element.getAttribute("data-fixture-kind") === "module") {
    return true;
  }
  if (element.getAttribute("data-fixture-kind") === "module") {
    return true;
  }
  const heading = element.textContent ?? "";
  return MODULE_HEADINGS.some((pattern) => pattern.test(heading));
}

function isSponsored(element: Element): boolean {
  const text = collectText(element);
  if (SPONSORED_PATTERN.test(text)) {
    return true;
  }
  return (
    element.querySelector(".fb-sponsored-label") !== null ||
    element.querySelector("[data-sponsored]") !== null
  );
}

function isSuggested(element: Element): boolean {
  const text = collectText(element);
  return (
    SUGGESTED_PATTERN.test(text) ||
    element.querySelector(".fb-suggested-header") !== null ||
    element.getAttribute("data-suggested") !== null
  );
}

function isGroupPost(element: Element): boolean {
  const text = collectText(element);
  if (GROUP_PATTERN.test(text)) {
    return true;
  }
  return (
    element.querySelector(".fb-group-header") !== null ||
    element.getAttribute("data-group-post") !== null
  );
}

function isPageAuthor(scope: Element): boolean {
  if (scope.getAttribute("data-page-indicator") !== null) {
    return true;
  }
  if (scope.querySelector("[data-page-indicator]") !== null) {
    return true;
  }
  if (scope.querySelector(".fb-page-indicator") !== null) {
    return true;
  }
  const text = collectText(scope);
  return /\bpage\b/iu.test(text) && !FRIEND_PATTERN.test(text);
}

function isFriendAuthor(scope: Element): boolean {
  if (scope.getAttribute("data-friend-indicator") !== null) {
    return true;
  }
  if (scope.querySelector("[data-friend-indicator]") !== null) {
    return true;
  }
  if (scope.querySelector(".fb-friend-indicator") !== null) {
    return true;
  }
  try {
    for (const labelled of querySelectorAllDeep(scope, "[aria-label]")) {
      const label = labelled.getAttribute("aria-label") ?? "";
      if (FRIEND_PATTERN.test(label)) {
        return true;
      }
    }
  } catch {
    // Best-effort only.
  }
  const text = readAuthorScopeText(scope);
  return FRIEND_PATTERN.test(text);
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
    const actors = querySelectorAllDeep(element, AUTHOR_SELECTOR);
    return actors.at(-1);
  } catch {
    return undefined;
  }
}

function readAuthorScopeText(scope: Element): string {
  try {
    const author = querySelectorDeep(scope, AUTHOR_SELECTOR) ?? scope;
    return author.textContent ?? "";
  } catch {
    return "";
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
  const role = element.getAttribute("role");
  if (role !== null && role.trim() !== "") {
    return `role:${role.trim()}`;
  }
  return "unknown";
}

function readItemTitle(element: Element): string | undefined {
  try {
    const description = querySelectorDeep(element, ".fb-post-content");
    const text = description?.textContent?.trim() ?? readActorName(element);
    return text && text.length > 0 ? text : undefined;
  } catch {
    return undefined;
  }
}

function readActorName(element: Element): string | undefined {
  try {
    const name = querySelectorDeep(element, AUTHOR_NAME_SELECTOR);
    const text = name?.textContent?.trim() ?? "";
    return text.length > 0 ? text : undefined;
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

export function isFacebookHomePath(pathname: string): boolean {
  const normalised = pathname.replace(/\/+$/u, "") || "/";
  return normalised === "/" || normalised === "/home";
}
