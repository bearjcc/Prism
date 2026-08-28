import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { extractYoutubeWatch } from "./youtube-watch.js";

const watchFixturePath = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "mods",
  "youtube-reddit-comments",
  "fixtures",
  "watch.html",
);

describe("extractYoutubeWatch", () => {
  test("returns the video id from a YouTube watch URL", () => {
    expect(
      extractYoutubeWatch(
        "https://www.youtube.com/watch?v=url-video-id&list=fixture",
      ),
    ).toEqual({ videoId: "url-video-id" });
  });

  test("uses the watch fixture when the supplied URL has no video id", () => {
    const dom = new JSDOM(readFileSync(watchFixturePath, "utf8"), {
      url: "https://www.youtube.com/watch",
    });

    expect(
      extractYoutubeWatch(dom.window.location.href, dom.window.document),
    ).toEqual({ videoId: "fixture-video-id" });
  });

  test("rejects non-watch URLs and missing fixture metadata", () => {
    const dom = new JSDOM("<main>Not a watch page</main>");

    expect(() =>
      extractYoutubeWatch("https://www.youtube.com/", dom.window.document),
    ).toThrow("video id");
  });
});
