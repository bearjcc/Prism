import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import {
  constrainYoutubeAutoplay,
  constrainYoutubeEndScreens,
  constrainYoutubeMiniplayer,
  dismissYoutubeIdlePrompt,
  extractYoutubeAutoplay,
  extractYoutubeEndScreens,
  extractYoutubeIdlePrompt,
  extractYoutubeMiniplayer,
  extractYoutubeWatch,
} from "./youtube-watch.js";

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

describe("extractYoutubeIdlePrompt", () => {
  test("returns a handle for a labelled fixture prompt and never copies HTML", () => {
    const dom = new JSDOM(`
      <yt-confirm-dialog-renderer data-prism-idle-prompt="continue-watching">
        <p>Video paused. Continue watching?</p>
        <button id="confirm-button" type="button">Yes</button>
      </yt-confirm-dialog-renderer>
    `);

    expect(extractYoutubeIdlePrompt(dom.window.document)).toEqual({
      kind: "continue-watching",
    });
    expect(JSON.stringify(extractYoutubeIdlePrompt(dom.window.document))).not.toMatch(
      /</u,
    );
  });

  test("returns a handle for a live yt-confirm-dialog-renderer", () => {
    const dom = new JSDOM(`
      <ytd-popup-container>
        <yt-confirm-dialog-renderer>
          <div id="title">Continue watching?</div>
          <button id="confirm-button" type="button">Yes</button>
        </yt-confirm-dialog-renderer>
      </ytd-popup-container>
    `);

    expect(extractYoutubeIdlePrompt(dom.window.document)).toEqual({
      kind: "continue-watching",
    });
  });

  test("returns null when no idle prompt is present", () => {
    const dom = new JSDOM("<main><video></video></main>");

    expect(extractYoutubeIdlePrompt(dom.window.document)).toBeNull();
  });
});

describe("dismissYoutubeIdlePrompt", () => {
  test("clicks the confirm button and marks the prompt dismissed", () => {
    const clicks: string[] = [];
    const dom = new JSDOM(`
      <yt-confirm-dialog-renderer data-prism-idle-prompt="continue-watching">
        <button id="confirm-button" type="button">Yes</button>
      </yt-confirm-dialog-renderer>
    `);
    const button = dom.window.document.querySelector("#confirm-button");
    button?.addEventListener("click", () => {
      clicks.push("confirm");
    });

    expect(dismissYoutubeIdlePrompt(dom.window.document)).toEqual({
      dismissed: true,
      kind: "continue-watching",
    });
    expect(clicks).toEqual(["confirm"]);
    expect(extractYoutubeIdlePrompt(dom.window.document)).toBeNull();
  });

  test("returns dismissed false when there is nothing to confirm", () => {
    const dom = new JSDOM("<main></main>");

    expect(dismissYoutubeIdlePrompt(dom.window.document)).toEqual({
      dismissed: false,
    });
  });
});

describe("extractYoutubeAutoplay", () => {
  test("returns autoplay true for a live autonav toggle that is on", () => {
    const dom = new JSDOM(`
      <button class="ytp-autonav-toggle-button" aria-checked="true" type="button">
        Autoplay
      </button>
    `);

    expect(extractYoutubeAutoplay(dom.window.document)).toEqual({
      autoplay: true,
    });
    expect(JSON.stringify(extractYoutubeAutoplay(dom.window.document))).not.toMatch(
      /</u,
    );
  });

  test("returns autoplay true for a labelled fixture toggle", () => {
    const dom = new JSDOM(`
      <button data-prism-autonav="true" aria-checked="true" type="button">
        Autoplay
      </button>
    `);

    expect(extractYoutubeAutoplay(dom.window.document)).toEqual({
      autoplay: true,
    });
  });

  test("returns autoplay true for a YouTube main video with the autoplay attribute", () => {
    const dom = new JSDOM(`
      <video class="html5-main-video" autoplay></video>
    `);

    expect(extractYoutubeAutoplay(dom.window.document)).toEqual({
      autoplay: true,
    });
  });

  test("returns null when autonav is off and the player has no autoplay attribute", () => {
    const dom = new JSDOM(`
      <button class="ytp-autonav-toggle-button" aria-checked="false" type="button">
        Autoplay
      </button>
      <video class="html5-main-video"></video>
    `);

    expect(extractYoutubeAutoplay(dom.window.document)).toBeNull();
  });
});

describe("constrainYoutubeAutoplay", () => {
  test("clicks the autonav toggle, clears video autoplay, and never copies HTML", () => {
    const clicks: string[] = [];
    const dom = new JSDOM(`
      <button class="ytp-autonav-toggle-button" aria-checked="true" type="button">
        Autoplay
      </button>
      <video class="html5-main-video" autoplay></video>
    `);
    const button = dom.window.document.querySelector(".ytp-autonav-toggle-button");
    button?.addEventListener("click", () => {
      clicks.push("autonav");
    });

    expect(constrainYoutubeAutoplay(dom.window.document)).toEqual({
      constrained: true,
      kind: "autonav",
    });
    expect(clicks).toEqual(["autonav"]);
    expect(button?.getAttribute("aria-checked")).toBe("false");
    expect(
      dom.window.document.querySelector("video")?.hasAttribute("autoplay"),
    ).toBe(false);
    expect(extractYoutubeAutoplay(dom.window.document)).toBeNull();
    expect(JSON.stringify(constrainYoutubeAutoplay(dom.window.document))).not.toMatch(
      /</u,
    );
  });

  test("returns constrained false when autoplay is already off", () => {
    const dom = new JSDOM("<main><video class=\"html5-main-video\"></video></main>");

    expect(constrainYoutubeAutoplay(dom.window.document)).toEqual({
      constrained: false,
    });
  });
});

describe("extractYoutubeEndScreens", () => {
  test("returns a handle for live end-screen and card overlays, never HTML", () => {
    const dom = new JSDOM(`
      <div class="ytp-endscreen-content">Suggested videos HTML</div>
      <div class="ytp-ce-element">Card overlay HTML</div>
      <video class="html5-main-video"></video>
    `);

    expect(extractYoutubeEndScreens(dom.window.document)).toEqual({
      present: true,
    });
    expect(
      JSON.stringify(extractYoutubeEndScreens(dom.window.document)),
    ).not.toMatch(/</u);
  });

  test("returns a handle for a labelled fixture overlay", () => {
    const dom = new JSDOM(`
      <aside data-prism-endscreen="true">Suggested videos</aside>
    `);

    expect(extractYoutubeEndScreens(dom.window.document)).toEqual({
      present: true,
    });
  });

  test("returns null when no end-screen overlays are present", () => {
    const dom = new JSDOM("<main><video class=\"html5-main-video\"></video></main>");

    expect(extractYoutubeEndScreens(dom.window.document)).toBeNull();
  });
});

describe("constrainYoutubeEndScreens", () => {
  test("hides live overlays and never copies HTML", () => {
    const dom = new JSDOM(`
      <div class="ytp-endscreen-content">Suggested videos HTML</div>
      <div class="ytp-ce-element">Card overlay HTML</div>
      <div class="ytp-cards-teaser">Cards teaser HTML</div>
      <video class="html5-main-video"></video>
    `);

    expect(constrainYoutubeEndScreens(dom.window.document)).toEqual({
      constrained: true,
      kind: "endscreen",
    });
    expect(extractYoutubeEndScreens(dom.window.document)).toBeNull();
    expect(
      JSON.stringify(constrainYoutubeEndScreens(dom.window.document)),
    ).not.toMatch(/</u);
    expect(
      dom.window.document.querySelector(".ytp-endscreen-content")?.hidden,
    ).toBe(true);
    expect(
      dom.window.document.querySelector(".ytp-ce-element")?.hidden,
    ).toBe(true);
    expect(
      dom.window.document.querySelector(".ytp-cards-teaser")?.hidden,
    ).toBe(true);
  });

  test("returns constrained false when there is nothing to hide", () => {
    const dom = new JSDOM("<main><video class=\"html5-main-video\"></video></main>");

    expect(constrainYoutubeEndScreens(dom.window.document)).toEqual({
      constrained: false,
    });
  });
});

describe("extractYoutubeMiniplayer", () => {
  test("returns a handle for a live ytd-miniplayer, never HTML", () => {
    const dom = new JSDOM(`
      <ytd-miniplayer>
        <div class="miniplayer-scrim">Now playing HTML</div>
        <button class="ytp-miniplayer-close-button" type="button">Close</button>
      </ytd-miniplayer>
      <video class="html5-main-video"></video>
    `);

    expect(extractYoutubeMiniplayer(dom.window.document)).toEqual({
      present: true,
    });
    expect(
      JSON.stringify(extractYoutubeMiniplayer(dom.window.document)),
    ).not.toMatch(/</u);
  });

  test("returns a handle for a labelled fixture miniplayer", () => {
    const dom = new JSDOM(`
      <aside data-prism-miniplayer="true">Miniplayer HTML</aside>
    `);

    expect(extractYoutubeMiniplayer(dom.window.document)).toEqual({
      present: true,
    });
  });

  test("returns null when no miniplayer is present", () => {
    const dom = new JSDOM("<main><video class=\"html5-main-video\"></video></main>");

    expect(extractYoutubeMiniplayer(dom.window.document)).toBeNull();
  });
});

describe("constrainYoutubeMiniplayer", () => {
  test("clicks close, hides the shell, and never copies HTML", () => {
    const clicks: string[] = [];
    const dom = new JSDOM(`
      <ytd-miniplayer>
        <div class="miniplayer-scrim">Now playing HTML</div>
        <button class="ytp-miniplayer-close-button" type="button">Close</button>
      </ytd-miniplayer>
      <div id="miniplayer">Docked player HTML</div>
      <video class="html5-main-video"></video>
    `);
    dom.window.document
      .querySelector(".ytp-miniplayer-close-button")
      ?.addEventListener("click", () => {
        clicks.push("close");
      });

    expect(constrainYoutubeMiniplayer(dom.window.document)).toEqual({
      constrained: true,
      kind: "miniplayer",
    });
    expect(clicks).toEqual(["close"]);
    expect(extractYoutubeMiniplayer(dom.window.document)).toBeNull();
    expect(
      JSON.stringify(constrainYoutubeMiniplayer(dom.window.document)),
    ).not.toMatch(/</u);
    expect(dom.window.document.querySelector("ytd-miniplayer")?.hidden).toBe(
      true,
    );
    expect(dom.window.document.querySelector("#miniplayer")?.hidden).toBe(true);
  });

  test("returns constrained false when there is nothing to close", () => {
    const dom = new JSDOM("<main><video class=\"html5-main-video\"></video></main>");

    expect(constrainYoutubeMiniplayer(dom.window.document)).toEqual({
      constrained: false,
    });
  });
});
