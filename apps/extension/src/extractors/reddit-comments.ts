import type { RedditComment } from "@prism/schema";

export interface RedditCommentsExtraction {
  readonly comments: readonly RedditComment[];
}

export type ParseHtmlDocument = (html: string) => Document;
export type FetchRedditHtml = (url: string) => Promise<string>;

const COMMENT_SELECTOR = '[data-testid="comment"], shreddit-comment';
const AUTHOR_SELECTOR = [
  '[data-testid="comment_author_link"]',
  '[slot="authorName"]',
].join(",");
const BODY_SELECTOR = [
  '[data-testid="comment-content"]',
  '[slot="comment"]',
].join(",");
const PERMALINK_SELECTOR = [
  'a[data-testid="comment_permalink"]',
  'a[slot="permalink"]',
].join(",");

export function parseRedditComments(
  html: string,
  parseDocument: ParseHtmlDocument,
): RedditCommentsExtraction {
  const document = parseDocument(html);
  const comments: RedditComment[] = [];

  for (const element of Array.from(document.querySelectorAll(COMMENT_SELECTOR))) {
    const author = readAuthor(element);
    const body = normaliseText(
      element.querySelector(BODY_SELECTOR)?.textContent ?? "",
    );
    const permalink = readPermalink(element);
    if (author === "" || body === "" || permalink === undefined) {
      continue;
    }
    comments.push({ author, body, permalink });
  }

  return { comments };
}

export async function searchRedditComments(
  query: string,
  fetchHtml: FetchRedditHtml,
  parseDocument: ParseHtmlDocument,
): Promise<RedditCommentsExtraction> {
  const trimmedQuery = query.trim();
  if (trimmedQuery === "") {
    throw new Error("Reddit comment search query is required");
  }

  return parseRedditComments(
    await fetchHtml(createRedditCommentSearchUrl(trimmedQuery)),
    parseDocument,
  );
}

export function createRedditCommentSearchUrl(query: string): string {
  const url = new URL("https://www.reddit.com/search/");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "comment");
  return url.href;
}

function readAuthor(element: Element): string {
  const fromAttribute =
    element.tagName.toLowerCase() === "shreddit-comment"
      ? element.getAttribute("author")
      : null;
  return normaliseText(
    fromAttribute ?? element.querySelector(AUTHOR_SELECTOR)?.textContent ?? "",
  ).replace(/^u\//u, "");
}

function readPermalink(element: Element): string | undefined {
  const fromAttribute =
    element.tagName.toLowerCase() === "shreddit-comment"
      ? element.getAttribute("permalink")
      : null;
  const href =
    fromAttribute ??
    element
      .querySelector<HTMLAnchorElement>(PERMALINK_SELECTOR)
      ?.getAttribute("href");
  if (href === null || href === undefined || href.trim() === "") {
    return undefined;
  }

  return normaliseRedditPermalink(href);
}

export function normaliseRedditPermalink(
  href: string,
): string | undefined {
  let url: URL;
  try {
    url = new URL(href, "https://www.reddit.com/");
  } catch {
    return undefined;
  }
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "reddit.com" && !url.hostname.endsWith(".reddit.com"))
  ) {
    return undefined;
  }
  return url.href;
}

function normaliseText(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}
