import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test, vi } from "vitest";
import {
  parseRedditComments,
  searchRedditComments,
} from "./reddit-comments.js";

const redditFixture = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "mods",
    "youtube-reddit-comments",
    "fixtures",
    "reddit-search.html",
  ),
  "utf8",
);

const parseDocument = (html: string): Document =>
  new JSDOM(html, { url: "https://www.reddit.com/" }).window.document;

describe("Reddit comments extractor", () => {
  test("parses complete comments from saved Reddit HTML", () => {
    expect(parseRedditComments(redditFixture, parseDocument)).toEqual({
      comments: [
        {
          author: "alice",
          body: "The first fixture comment.",
          permalink:
            "https://www.reddit.com/r/videos/comments/abc/post/one/",
        },
        {
          author: "bob",
          body: "A second comment with useful detail.",
          permalink:
            "https://www.reddit.com/r/videos/comments/abc/post/two/",
        },
      ],
    });
  });

  test("fetches a documented Reddit comment-search URL without live network", async () => {
    const fetchHtml = vi.fn().mockResolvedValue(redditFixture);

    await expect(
      searchRedditComments("fixture-video-id", fetchHtml, parseDocument),
    ).resolves.toEqual({
      comments: expect.arrayContaining([
        expect.objectContaining({ author: "alice" }),
      ]),
    });
    expect(fetchHtml).toHaveBeenCalledWith(
      "https://www.reddit.com/search/?q=fixture-video-id&type=comment",
    );
  });

  test("rejects an empty query before requesting Reddit", async () => {
    const fetchHtml = vi.fn();

    await expect(
      searchRedditComments("  ", fetchHtml, parseDocument),
    ).rejects.toThrow("query");
    expect(fetchHtml).not.toHaveBeenCalled();
  });
});
