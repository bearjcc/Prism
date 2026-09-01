import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import { extractAdSlots } from "./ad-slot.js";

describe("extractAdSlots", () => {
  test("returns opaque handles for labelled fixture slots", () => {
    const dom = new JSDOM(`
      <main>
        <aside data-prism-ad-slot="sidebar">Buy something</aside>
        <section data-prism-ad-slot="banner">Sponsored HTML</section>
      </main>
    `);

    expect(extractAdSlots(dom.window.document)).toEqual([
      { id: "sidebar" },
      { id: "banner" },
    ]);
  });

  test("ignores blank and duplicate fixture slot labels", () => {
    const dom = new JSDOM(`
      <div data-prism-ad-slot=""></div>
      <div data-prism-ad-slot="same"></div>
      <div data-prism-ad-slot="same"></div>
    `);

    expect(extractAdSlots(dom.window.document)).toEqual([{ id: "same" }]);
  });

  test("labels live YouTube and AdSense slots without copying page HTML", () => {
    const dom = new JSDOM(`
      <ytd-ad-slot-renderer>Sponsored markup</ytd-ad-slot-renderer>
      <ins class="adsbygoogle"></ins>
      <div id="masthead-ad"></div>
      <ytd-rich-item-renderer>Not an advert</ytd-rich-item-renderer>
    `);
    const document = dom.window.document;

    expect(extractAdSlots(document)).toEqual([
      { id: "live:ytd-ad-slot-renderer:0" },
      { id: "live:adsbygoogle:0" },
      { id: "live:masthead-ad:0" },
    ]);
    expect(
      document
        .querySelector("ytd-ad-slot-renderer")
        ?.getAttribute("data-prism-ad-slot"),
    ).toBe("live:ytd-ad-slot-renderer:0");
    expect(extractAdSlots(document)[0]).toEqual({
      id: "live:ytd-ad-slot-renderer:0",
    });
  });

  test("labels first-party YouTube watch advert surfaces without copying HTML", () => {
    const dom = new JSDOM(`
      <ytd-player-legacy-desktop-watch-ads-renderer>Watch companion HTML</ytd-player-legacy-desktop-watch-ads-renderer>
      <ytd-action-companion-ad-renderer>Action companion HTML</ytd-action-companion-ad-renderer>
      <ytd-promoted-video-renderer>Promoted video HTML</ytd-promoted-video-renderer>
      <div class="ytp-ad-player-overlay">Skip advert overlay</div>
      <ytd-watch-flexy>Watch chrome</ytd-watch-flexy>
    `);
    const document = dom.window.document;

    expect(extractAdSlots(document)).toEqual([
      { id: "live:ytd-player-legacy-desktop-watch-ads-renderer:0" },
      { id: "live:ytd-action-companion-ad-renderer:0" },
      { id: "live:ytd-promoted-video-renderer:0" },
      { id: "live:ytp-ad-player-overlay:0" },
    ]);
    expect(JSON.stringify(extractAdSlots(document))).not.toMatch(/</u);
    expect(document.querySelector("ytd-watch-flexy")?.textContent).toBe(
      "Watch chrome",
    );
  });

  test("does not relabel a fixture slot that already has a handle", () => {
    const dom = new JSDOM(`
      <ytd-ad-slot-renderer data-prism-ad-slot="fixture-ad">HTML</ytd-ad-slot-renderer>
    `);

    expect(extractAdSlots(dom.window.document)).toEqual([{ id: "fixture-ad" }]);
  });

  test("skips slots already replaced with extension-owned content", () => {
    const dom = new JSDOM(`
      <aside data-prism-ad-slot="sidebar">
        <img data-prism-owned="true" alt="kitten">
      </aside>
      <ytd-ad-slot-renderer>
        <img data-prism-owned="true" alt="kitten">
      </ytd-ad-slot-renderer>
      <div data-prism-ad-slot="fresh">Advert</div>
    `);

    expect(extractAdSlots(dom.window.document)).toEqual([{ id: "fresh" }]);
  });
});
