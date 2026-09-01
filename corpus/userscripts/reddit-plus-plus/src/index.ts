import type { PrismApi } from "@prism/schema";

const KEYWORDS = ["crypto dump"];

export async function activate(prism: PrismApi): Promise<void> {
  prism.styles.apply(
    ".promotedlink, shreddit-ad, [data-testid=\"promoted-post\"] { display: none !important; }",
  );
  const extracted = await prism.extract("reddit.feed.posts");
  const hide = readPosts(extracted)
    .filter((post) => matchesKeyword(post.title))
    .map((post) => `[data-prism-feed-item="${escapeCssAttr(post.id)}"]`);
  if (hide.length === 0) {
    return;
  }
  prism.styles.apply(`${hide.join(", ")} { display: none !important; }`);
}

function readPosts(
  value: unknown,
): ReadonlyArray<{ readonly id: string; readonly title: string }> {
  if (
    typeof value !== "object" ||
    value === null ||
    !("posts" in value) ||
    !Array.isArray(value.posts)
  ) {
    return [];
  }
  const posts: Array<{ id: string; title: string }> = [];
  for (const post of value.posts) {
    if (
      typeof post === "object" &&
      post !== null &&
      "id" in post &&
      "title" in post &&
      typeof post.id === "string" &&
      typeof post.title === "string"
    ) {
      posts.push({ id: post.id, title: post.title });
    }
  }
  return posts;
}

function matchesKeyword(title: string): boolean {
  const haystack = title.toLowerCase();
  return KEYWORDS.some((keyword) => haystack.includes(keyword));
}

function escapeCssAttr(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}
