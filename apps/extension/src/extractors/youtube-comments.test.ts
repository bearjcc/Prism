import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import {
  findYoutubeCommentsFallbackHost,
  findYoutubeCommentsSlot,
  watchPageNeedsCommentsMount,
} from "./youtube-comments.js";

const modRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "mods",
  "youtube-reddit-comments",
);

describe("findYoutubeCommentsSlot", () => {
  test("finds the fixture marker in the simple watch fixture", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "watch.html"), "utf8"),
      { url: "https://www.youtube.com/watch?v=fixture-video-id" },
    );

    expect(findYoutubeCommentsSlot(dom.window.document)?.tagName).toBe("SECTION");
  });

  test("finds comments inside open shadow roots on a live-shaped watch fixture", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "watch-live.html"), "utf8"),
      { url: "https://www.youtube.com/watch?v=fixture-video-id" },
    );

    const slot = findYoutubeCommentsSlot(dom.window.document);
    expect(slot?.tagName).toBe("YTD-COMMENTS");
    expect(slot?.id).toBe("sections");
    expect(
      dom.window.document.querySelector("ytd-comments#comments"),
    ).toBeNull();
  });

  test("finds comments nested inside open shadow roots", () => {
    const dom = new JSDOM("<body></body>", {
      url: "https://www.youtube.com/watch?v=fixture-video-id",
    });
    const host = dom.window.document.createElement("ytd-app");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <ytd-watch-flexy video-id="fixture-video-id">
        <ytd-item-section-renderer target-id="comments-section">
          <ytd-comments id="sections">
            <p>Shadow comments</p>
          </ytd-comments>
        </ytd-item-section-renderer>
      </ytd-watch-flexy>
    `;
    dom.window.document.body.append(host);

    const slot = findYoutubeCommentsSlot(dom.window.document);
    expect(slot?.tagName).toBe("YTD-COMMENTS");
    expect(slot?.id).toBe("sections");
  });

  test("uses the comments section wrapper when the inner host is absent", () => {
    const dom = new JSDOM(
      `
      <ytd-watch-flexy>
        <ytd-item-section-renderer target-id="comments-section">
          <p>Comments load here later</p>
        </ytd-item-section-renderer>
      </ytd-watch-flexy>
    `,
      { url: "https://www.youtube.com/watch?v=fixture-video-id" },
    );

    expect(findYoutubeCommentsSlot(dom.window.document)?.tagName).toBe(
      "YTD-ITEM-SECTION-RENDERER",
    );
  });

  test("finds a secondary-column fallback host on live-shaped watch pages", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "watch-live.html"), "utf8"),
      { url: "https://www.youtube.com/watch?v=fixture-video-id" },
    );

    expect(
      findYoutubeCommentsFallbackHost(dom.window.document)?.tagName,
    ).toBe("YTD-WATCH-NEXT-SECONDARY-RESULTS-RENDERER");
  });
});

describe("watchPageNeedsCommentsMount", () => {
  test("is true on a watch page until the Reddit panel owns a host", () => {
    const dom = new JSDOM(
      readFileSync(join(modRoot, "fixtures", "watch-live.html"), "utf8"),
      { url: "https://www.youtube.com/watch?v=fixture-video-id" },
    );

    expect(
      watchPageNeedsCommentsMount(
        dom.window.document,
        "https://www.youtube.com/watch?v=fixture-video-id",
      ),
    ).toBe(true);

    const slot = findYoutubeCommentsSlot(dom.window.document);
    const owned = dom.window.document.createElement("section");
    owned.dataset.prismOwned = "youtube-reddit-comments";
    slot?.append(owned);

    expect(
      watchPageNeedsCommentsMount(
        dom.window.document,
        "https://www.youtube.com/watch?v=fixture-video-id",
      ),
    ).toBe(false);
  });

  test("is false on non-watch pages", () => {
    const dom = new JSDOM("<main>Home</main>", {
      url: "https://www.youtube.com/",
    });

    expect(
      watchPageNeedsCommentsMount(dom.window.document, dom.window.location.href),
    ).toBe(false);
  });
});
