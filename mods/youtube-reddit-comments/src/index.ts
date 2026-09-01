import type {
  AdSlotHandle,
  PrismApi,
  RedditComment,
  TrustedReplacement,
} from "@prism/schema";

const COMMENTS_SLOT: AdSlotHandle = { id: "youtube-comments" };
const FALLBACK: TrustedReplacement = {
  kind: "message",
  message: "Reddit comments are unavailable. Enable Reddit comments access and reload.",
};

export async function activate(prism: PrismApi): Promise<void> {
  const watch = await prism.extract("youtube.watch.videoId");
  if (!isWatchExtraction(watch)) {
    return;
  }

  let replacement = FALLBACK;
  try {
    const extracted = await prism.extract("reddit.comments.search", {
      query: watch.videoId,
    });
    if (isCommentsExtraction(extracted)) {
      replacement = {
        kind: "comments",
        heading: "Reddit comments",
        comments: extracted.comments,
      };
    }
  } catch {
    // The optional capability is off or Reddit is unavailable.
  }
  prism.slots.replace(COMMENTS_SLOT, replacement);
}

function isWatchExtraction(value: unknown): value is { readonly videoId: string } {
  return (
    isRecord(value) &&
    typeof value.videoId === "string" &&
    value.videoId.trim() !== ""
  );
}

function isCommentsExtraction(
  value: unknown,
): value is { readonly comments: readonly RedditComment[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.comments) &&
    value.comments.every(isRedditComment)
  );
}

function isRedditComment(value: unknown): value is RedditComment {
  return (
    isRecord(value) &&
    typeof value.author === "string" &&
    typeof value.body === "string" &&
    typeof value.permalink === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
