/** @vitest-environment jsdom */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModShot } from "./mod-shot";
import { catalogue, modPreviewProps } from "../lib/catalogue";

describe("ModShot", () => {
  it("renders catalogue previews from /previews/", () => {
    for (const mod of catalogue()) {
      const preview = modPreviewProps(mod);
      const html = renderToStaticMarkup(<ModShot src={preview.src} alt={preview.alt} />);
      expect(html).toMatch(/img[^>]+src="\/previews\//);
      expect(html).toContain(preview.src);
      expect(html).toContain(preview.alt);
    }
  });
});
