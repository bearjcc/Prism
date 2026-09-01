import { describe, expect, test } from "vitest";
import { cssFromMappedUserCss, mapUserCss } from "./usercss-map.js";

describe("mapUserCss", () => {
  test("maps display:none onto visual.hide", () => {
    const mapped = mapUserCss(".advert { display: none; }");
    expect(mapped.hides).toEqual([
      {
        capability: "visual.hide",
        selector: ".advert",
        declaration: "display: none",
      },
    ]);
    expect(mapped.apply.trim()).toBe("");
  });

  test("maps visibility:hidden as a hide", () => {
    const mapped = mapUserCss(".toast { visibility: hidden !important; }");
    expect(mapped.hides).toEqual([
      {
        capability: "visual.hide",
        selector: ".toast",
        declaration: "visibility: hidden !important",
      },
    ]);
    expect(mapped.apply.trim()).toBe("");
  });

  test("leaves leftover cosmetic CSS on the styles.apply payload", () => {
    const mapped = mapUserCss(`
.advert { display: none; }
.container-xl { max-width: none !important; }
`);
    expect(mapped.hides.map((hide) => hide.selector)).toEqual([".advert"]);
    expect(mapped.apply).toContain(".container-xl");
    expect(mapped.apply).toContain("max-width: none !important");
    expect(mapped.apply).not.toMatch(/display:\s*none/iu);
  });

  test("splits a mixed rule into hide plus leftover declarations", () => {
    const mapped = mapUserCss(".ad { display: none; color: red; }");
    expect(mapped.hides).toEqual([
      {
        capability: "visual.hide",
        selector: ".ad",
        declaration: "display: none",
      },
    ]);
    expect(mapped.apply).toContain(".ad");
    expect(mapped.apply).toContain("color: red");
    expect(mapped.apply).not.toMatch(/display:\s*none/iu);
  });

  test("keeps compiled CSS verbatim when nothing maps to hide", () => {
    const source = ".container-xl { max-width: none !important; }";
    expect(mapUserCss(source).apply).toBe(source);
    expect(mapUserCss(source).hides).toEqual([]);
  });

  test("leaves @media blocks on the apply payload", () => {
    const mapped = mapUserCss(
      "@media (min-width: 1px) { .ad { display: none; } }",
    );
    expect(mapped.hides).toEqual([]);
    expect(mapped.apply).toContain("@media");
    expect(mapped.apply).toContain("display: none");
  });

  test("still fail-closes forbidden url(, @import, update URL, and preprocessor", () => {
    expect(() =>
      mapUserCss("a { background: url(https://x.test/a.png); }"),
    ).toThrow(/url\(/u);
    expect(() => mapUserCss('@import "https://x.test/a.css";')).toThrow(
      /@import/u,
    );
    expect(() =>
      mapUserCss(`/* ==UserStyle==
@name Remote
@updateURL https://evil.test/wide.user.css
==/UserStyle== */
body { color: red; }
`),
    ).toThrow(/update URL/u);
    expect(() =>
      mapUserCss(`/* ==UserStyle==
@name Theme
@preprocessor less
==/UserStyle== */
body { color: red; }
`),
    ).toThrow(/preprocessor/u);
  });

  test("reconstitutes mapped hides for styles.apply injection", () => {
    const mapped = mapUserCss(".advert { display: none; } .wide { width: 100%; }");
    const payload = cssFromMappedUserCss(mapped);
    expect(payload).toContain(".advert { display: none; }");
    expect(payload).toContain("width: 100%");
  });
});
