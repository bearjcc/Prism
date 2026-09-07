/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModShot } from "./mod-shot";
import { catalogue } from "../lib/catalogue";

describe("ModShot", () => {
  it("renders catalogue previews from /previews/", () => {
    for (const mod of catalogue()) {
      const html = renderToStaticMarkup(<ModShot src={mod.previewSrc} alt={mod.previewAlt} />);
      expect(html).toMatch(/img[^>]+src="\/previews\//);
      expect(html).toContain(mod.previewSrc);
      expect(html).toContain(mod.previewAlt);
    }
  });
});
