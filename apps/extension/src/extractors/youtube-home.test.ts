import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import {
  extractYoutubeHome,
  findYoutubeHomeFeed,
} from "./youtube-home.js";

const modRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "mods",
  "youtube-home-videos",
);

const fixturePath = join(modRoot, "fixtures", "home.html");
const liveFixturePath = join(modRoot, "fixtures", "home-live.html");

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

  test("returns lockup-based videos from the live-shaped Home fixture", () => {
    const dom = new JSDOM(readFileSync(liveFixturePath, "utf8"), {
      url: "https://www.youtube.com/",
    });

    expect(extractYoutubeHome(dom.window.document)).toEqual({
      videos: [
        {
          id: "lockup-alpha",
          title: "Lockup alpha video",
          href: "https://www.youtube.com/watch?v=lockup-alpha",
        },
        {
          id: "lockup-beta",
          title: "Lockup beta video",
          href: "https://www.youtube.com/watch?v=lockup-beta",
        },
        {
          id: "lockup-gamma",
          title: "Lockup gamma video",
          href: "https://www.youtube.com/watch?v=lockup-gamma",
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
          <ytd-rich-item-renderer lockup is-slim-media>
            <ytm-shorts-lockup-view-model>
              <a href="/shorts/inline-short">Inline short</a>
            </ytm-shorts-lockup-view-model>
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

describe("findYoutubeHomeFeed", () => {
  test("prefers the Home browse feed over other rich grids", () => {
    const dom = new JSDOM(
      `
      <ytd-rich-grid-renderer>
        <div id="contents" data-fixture-kind="stray-grid">
          <p>Stray grid</p>
        </div>
      </ytd-rich-grid-renderer>
      ${readFileSync(liveFixturePath, "utf8").match(
        /<ytd-browse[\s\S]*<\/ytd-browse>/u,
      )?.[0] ?? ""}
    `,
      { url: "https://www.youtube.com/" },
    );

    const feed = findYoutubeHomeFeed(dom.window.document);
    expect(feed).not.toBeNull();
    expect(feed?.querySelector('[data-fixture-kind="stray-grid"]')).toBeNull();
    expect(feed?.querySelector("ytd-rich-item-renderer[lockup]")).not.toBeNull();
  });
});
