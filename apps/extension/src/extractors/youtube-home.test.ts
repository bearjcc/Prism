import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { extractYoutubeHome } from "./youtube-home.js";

const fixturePath = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "mods",
  "youtube-home-videos",
  "fixtures",
  "home.html",
);

describe("extractYoutubeHome", () => {
  test("returns only ordinary video items from the Home fixture", () => {
    const dom = new JSDOM(readFileSync(fixturePath, "utf8"), {
      url: "https://www.youtube.com/",
    });

    expect(extractYoutubeHome(dom.window.document)).toEqual({
      videos: [
        {
          id: "video-alpha",
          title: "Alpha video",
          href: "/watch?v=video-alpha",
        },
        {
          id: "video-beta",
          title: "Beta video",
          href: "/watch?v=video-beta",
        },
      ],
    });
  });

  test("rejects shorts and incomplete video cards", () => {
    const dom = new JSDOM(`
      <ytd-rich-grid-renderer>
        <div id="contents">
          <ytd-rich-item-renderer>
            <ytd-rich-grid-media>
              <a id="video-title-link" href="/shorts/not-a-video">Short</a>
            </ytd-rich-grid-media>
          </ytd-rich-item-renderer>
          <ytd-rich-item-renderer>
            <ytd-rich-grid-media>
              <a id="video-title-link" href="/watch?v=missing-title"></a>
            </ytd-rich-grid-media>
          </ytd-rich-item-renderer>
        </div>
      </ytd-rich-grid-renderer>
    `);

    expect(extractYoutubeHome(dom.window.document)).toEqual({ videos: [] });
  });
});
