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
const ACTOR_NAME_SELECTORS = [
  AUTHOR_NAME_SELECTOR,
  "h2 span a",
  "h3 span a",
  "h2 a",
  "h3 a",
  "strong a",
];
const ACTIVITY_HEADER_SELECTOR = ".fb-activity-header";

const MODULE_HEADINGS = [
  /people you may know/iu,
  /reels(?:\s+for you)?/iu,
  /suggested reels/iu,
  /\bstories\b/iu,
];

const ACTIVITY_HEADER_PATTERN =
  /\b(?:shared (?:this|a post)|commented on|likes this|liked this)\b/iu;

const SPONSORED_PATTERN = /\b(?:sponsored|ad)\b/iu;
const SUGGESTED_PATTERN = /\bsuggested for you\b/iu;
const GROUP_PATTERN = /\b(?:posted in|shared (?:to|with) .+ group)\b/iu;
const FRIEND_PATTERN = /\bfriends?\b/iu;

const STORIES_ARIA_PATTERN =
  /\b(?:stories|story reel|reels tray|create a story|create story)\b/iu;

const DOCUMENT_POSITION_FOLLOWING = 4;
const DOCUMENT_POSITION_PRECEDING = 2;

export function findFacebookHomeFeed(root: ParentNode): Element | undefined {
  try {
    const pathname = readPathname(root);
    if (pathname !== undefined && !isFacebookHomePath(pathname)) {
      return undefined;
    }
    const feeds = querySelectorAllDeep(root, FEED_ROOT_SELECTOR);
    if (feeds.length === 0) {
      return undefined;
    }
    let best: Element | undefined;
    let bestScore = -1;
    for (const feed of feeds) {
      const score = scoreFeedCandidate(feed);
      if (score > bestScore && feedHasItems(feed)) {
        bestScore = score;
        best = feed;
      }
    }
    return best;
  } catch {
    return undefined;
  }
}

export function facebookHomeFeedChildren(feed: Element): Element[] {
  try {
    const directChildren = Array.from(feed.children).filter(isElementNode);
    const feedItems = topLevelFeedItems(feed);

    if (feedItems.length === 0) {
      return directChildren;
    }

    const allItemsAreDirectChildren = feedItems.every(
      (item) => item.parentElement === feed,
    );
    if (allItemsAreDirectChildren) {
      return feedItems;
    }

    if (
      directChildren.length === 1 &&
      feedItems.length > 0 &&
      directChildren[0]!.contains(feedItems[0]!)
    ) {
      return feedItems;
    }

    const placements: Element[] = [];
    for (const child of directChildren) {
      if (feedItems.some((item) => child === item || child.contains(item))) {
        placements.push(child);
      }
    }
    if (placements.length > 0) {
      return placements;
    }

    return feedItems;
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
  if (isOrganicFriendPost(element)) {
    return "friend";
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
  if (isStoriesReelsTray(element)) {
    return true;
  }
  const heading = element.textContent ?? "";
  return MODULE_HEADINGS.some((pattern) => pattern.test(heading));
}

function isStoriesReelsTray(element: Element): boolean {
  try {
    const nestedArticles = querySelectorAllDeep(element, '[role="article"]').filter(
      (article) => article !== element,
    );
    if (nestedArticles.length >= 2) {
      return true;
    }
    for (const labelled of querySelectorAllDeep(element, "[aria-label]")) {
      const label = labelled.getAttribute("aria-label") ?? "";
      if (STORIES_ARIA_PATTERN.test(label)) {
        return true;
      }
    }
  } catch {
    // Best-effort only.
  }
  return false;
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
  if (hasActorFollowPrompt(scope)) {
    return true;
  }
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

function hasActorFollowPrompt(scope: Element): boolean {
  try {
    for (const node of querySelectorAllDeep(
      scope,
      "a, [role='link'], [role='button']",
    )) {
      const text = (node.textContent ?? "").trim();
      if (/^follow$/iu.test(text)) {
        return true;
      }
    }
  } catch {
    // Best-effort only.
  }
  return false;
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

function isOrganicFriendPost(element: Element): boolean {
  if (element.getAttribute("role") !== "article") {
    return false;
  }
  if (hasActorFollowPrompt(element)) {
    return false;
  }
  if (isStoriesReelsTray(element)) {
    return false;
  }
  if (
    isSponsored(element) ||
    isSuggested(element) ||
    isGroupPost(element) ||
    isActivityCard(element)
  ) {
    return false;
  }
  return readActorName(element) !== undefined;
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
    for (const selector of ACTOR_NAME_SELECTORS) {
      const name = querySelectorDeep(element, selector);
      const text = name?.textContent?.trim() ?? "";
      if (text.length > 0 && !/^follow$/iu.test(text)) {
        return text;
      }
    }
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

function topLevelFeedItems(feed: Element): Element[] {
  const items = querySelectorAllDeep(feed, FEED_ITEM_SELECTOR);
  const topLevel = items.filter(
    (item) => !items.some((other) => other !== item && other.contains(item)),
  );
  return topLevel.sort(compareDocumentOrder);
}

function compareDocumentOrder(a: Element, b: Element): number {
  const position = a.compareDocumentPosition(b);
  if (position & DOCUMENT_POSITION_FOLLOWING) {
    return -1;
  }
  if (position & DOCUMENT_POSITION_PRECEDING) {
    return 1;
  }
  return 0;
}

function scoreFeedCandidate(feed: Element): number {
  let score = 0;
  if (feed.getAttribute("data-facebook-home-feed") !== null) {
    score += 10_000;
  }
  if (feed.closest('[role="main"]') !== null) {
    score += 1_000;
  }
  try {
    score += querySelectorAllDeep(feed, '[role="article"]').length;
  } catch {
    // Best-effort only.
  }
  return score;
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

function isElementNode(node: unknown): node is Element {
  return (
    typeof node === "object" &&
    node !== null &&
    "tagName" in node &&
    typeof (node as Element).getAttribute === "function"
  );
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
