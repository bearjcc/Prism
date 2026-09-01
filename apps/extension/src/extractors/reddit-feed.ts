export interface RedditFeedPost {
  readonly id: string;
  readonly title: string;
}

export interface RedditFeedExtraction {
  readonly posts: readonly RedditFeedPost[];
}

const FEED_ITEM_ATTRIBUTE = "data-prism-feed-item";

const LIVE_FEED_SELECTORS: ReadonlyArray<{
  readonly selector: string;
  readonly kind: string;
}> = [
  { selector: "shreddit-post", kind: "shreddit-post" },
  { selector: '[data-testid="post-container"]', kind: "post-container" },
  { selector: ".thing.link", kind: "thing-link" },
];

export const LIVE_REDDIT_FEED_SELECTOR = LIVE_FEED_SELECTORS.map(
  ({ selector }) => selector,
).join(", ");

export function redditFeedHasUnlabelledPosts(root: ParentNode): boolean {
  return Array.from(root.querySelectorAll(LIVE_REDDIT_FEED_SELECTOR)).some(
    (element) => {
      const existing = element.getAttribute(FEED_ITEM_ATTRIBUTE)?.trim();
      return existing === undefined || existing === "";
    },
  );
}

export function extractRedditFeedPosts(root: ParentNode): RedditFeedExtraction {
  const posts: RedditFeedPost[] = [];
  const seen = new Set<string>();
  const counts = new Map<string, number>();

  for (const { selector, kind } of LIVE_FEED_SELECTORS) {
    for (const element of Array.from(root.querySelectorAll(selector))) {
      const existing = element.getAttribute(FEED_ITEM_ATTRIBUTE)?.trim();
      const id = existing === undefined || existing === ""
        ? nextFeedId(counts, kind)
        : existing;
      if (seen.has(id)) {
        continue;
      }
      if (existing === undefined || existing === "") {
        element.setAttribute(FEED_ITEM_ATTRIBUTE, id);
      }
      seen.add(id);
      posts.push({
        id,
        title: readPostTitle(element),
      });
    }
  }

  return { posts };
}

function nextFeedId(counts: Map<string, number>, kind: string): string {
  const index = counts.get(kind) ?? 0;
  counts.set(kind, index + 1);
  return `live:${kind}:${index}`;
}

function readPostTitle(element: Element): string {
  const titled =
    element.querySelector('[slot="title"]') ??
    element.querySelector("a.title") ??
    element.querySelector("h3") ??
    element.querySelector("h1");
  return (titled?.textContent ?? element.textContent ?? "").trim();
}
