import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { extractRedditFeedPosts } from "./reddit-feed.js";

describe("extractRedditFeedPosts", () => {
  test("returns JSON titles for new Reddit, old Reddit, and testid posts", () => {
    const document = new JSDOM(`
      <shreddit-post>
        <a slot="title">New Reddit title</a>
      </shreddit-post>
      <div data-testid="post-container">
        <h3>Redesign title</h3>
      </div>
      <div class="thing link">
        <a class="title">Old Reddit title</a>
      </div>
    `).window.document;

    expect(extractRedditFeedPosts(document)).toEqual({
      posts: [
        { id: "live:shreddit-post:0", title: "New Reddit title" },
        { id: "live:post-container:0", title: "Redesign title" },
        { id: "live:thing-link:0", title: "Old Reddit title" },
      ],
    });
    expect(JSON.stringify(extractRedditFeedPosts(document))).not.toMatch(/</u);
  });

  test("reuses existing feed handles and skips duplicates", () => {
    const document = new JSDOM(`
      <shreddit-post data-prism-feed-item="live:shreddit-post:0">
        <a slot="title">First</a>
      </shreddit-post>
      <shreddit-post data-prism-feed-item="live:shreddit-post:0">
        <a slot="title">Duplicate handle</a>
      </shreddit-post>
    `).window.document;

    expect(extractRedditFeedPosts(document)).toEqual({
      posts: [{ id: "live:shreddit-post:0", title: "First" }],
    });
  });
});
