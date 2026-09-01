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
          href: "https://www.youtube.com/watch?v=video-alpha",
        },
        {
          id: "video-beta",
          title: "Beta video",
          href: "https://www.youtube.com/watch?v=video-beta",
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

  test("rejects watch links outside youtube.com", () => {
    const dom = new JSDOM(`
      <ytd-rich-item-renderer>
        <ytd-rich-grid-media>
          <a id="video-title-link"
             href="https://evil.example/watch?v=stolen">External watch link</a>
          <a id="video-title"
             href="https://m.youtube.com/watch?v=mobile">Mobile host</a>
        </ytd-rich-grid-media>
      </ytd-rich-item-renderer>
    `);

    expect(extractYoutubeHome(dom.window.document)).toEqual({ videos: [] });
  });

  test("skips watch links that are not valid URLs", () => {
    const dom = new JSDOM(`
      <ytd-rich-item-renderer>
        <ytd-rich-grid-media>
          <a id="video-title-link" href="https://[">Broken watch link</a>
        </ytd-rich-grid-media>
      </ytd-rich-item-renderer>
    `);

    expect(extractYoutubeHome(dom.window.document)).toEqual({ videos: [] });
  });
});
