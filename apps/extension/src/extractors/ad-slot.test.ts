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
});
