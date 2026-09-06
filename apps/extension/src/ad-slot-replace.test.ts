import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import {
  applyFootprintToImage,
  footprintsMatch,
  measureAdSlotFootprint,
} from "./ad-slot-replace.js";

describe("ad slot replacement footprint", () => {
  test("measures explicit reserved advert dimensions before replacement", () => {
    const dom = new JSDOM(`
      <aside
        data-prism-ad-slot="sidebar"
        style="display:block;width:300px;height:250px;min-width:300px;min-height:250px;"
      >
        <a href="https://ads.example.test/sidebar">Sidebar advert</a>
      </aside>
    `);
    const slot = dom.window.document.querySelector("[data-prism-ad-slot]")!;

    expect(measureAdSlotFootprint(slot)).toEqual({
      width: 300,
      height: 250,
    });
  });

  test("sizes replacement images to the measured slot footprint", () => {
    const dom = new JSDOM(`
      <section
        data-prism-ad-slot="banner"
        style="display:block;width:728px;height:90px;"
      >
        <ins class="adsbygoogle" style="display:inline-block;width:728px;height:90px">
          Banner advert
        </ins>
      </section>
    `);
    const slot = dom.window.document.querySelector("[data-prism-ad-slot]")!;
    const footprint = measureAdSlotFootprint(slot);
    const image = dom.window.document.createElement("img");
    applyFootprintToImage(image, footprint);

    expect(image.width).toBe(728);
    expect(image.height).toBe(90);
    expect(image.style.objectFit).toBe("cover");
    expect(
      footprintsMatch(footprint, {
        width: image.width,
        height: image.height,
      }),
    ).toBe(true);
  });
});
