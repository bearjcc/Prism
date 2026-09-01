import { describe, expect, test } from "vitest";
import { compileUserCss, sanitiseCss } from "./css.js";

describe("compileUserCss", () => {
  test("unwraps @-moz-document so rules are injectable in Chromium", () => {
    const compiled = compileUserCss(`
@-moz-document domain("github.com") {
  .container-xl { max-width: none !important; }
}
`);
    expect(compiled).toContain(".container-xl { max-width: none !important; }");
    expect(compiled).not.toMatch(/@-moz-document/u);
  });

  test("keeps only @-moz-document sections that match the page URL", () => {
    const source = `
@-moz-document domain("github.com") {
  .repo { max-width: none; }
}
@-moz-document domain("example.test") {
  .ad { display: none; }
}
`;
    expect(compileUserCss(source, "https://github.com/a/b")).toContain(".repo");
    expect(compileUserCss(source, "https://github.com/a/b")).not.toContain(".ad");
    expect(compileUserCss(source, "https://example.test/")).toContain(".ad");
    expect(compileUserCss(source, "https://example.test/")).not.toContain(".repo");
  });

  test("treats document url() as a matcher, not a remote load", () => {
    const compiled = compileUserCss(
      `@-moz-document url("https://github.com/settings") { body { color: red; } }`,
      "https://github.com/settings",
    );
    expect(compiled).toContain("body { color: red; }");
    expect(
      compileUserCss(
        `@-moz-document url("https://github.com/settings") { body { color: red; } }`,
        "https://github.com/",
      ),
    ).not.toContain("color: red");
  });

  test("matches regexp() document rules", () => {
    const source =
      '@-moz-document regexp("^https://(?:gist\\.)?github\\.com/.*") { .wide { width: 100%; } }';
    expect(compileUserCss(source, "https://github.com/a/b")).toContain(".wide");
    expect(compileUserCss(source, "https://gist.github.com/a")).toContain(".wide");
    expect(compileUserCss(source, "https://gitlab.com/a")).not.toContain(".wide");
  });

  test("CSS-unescapes regexp() values from UserCSS source", () => {
    const source =
      '@-moz-document regexp("^https://(?:gist\\\\.)?github\\\\.com/.*") { .wide { width: 100%; } }';
    expect(compileUserCss(source, "https://github.com/a/b")).toContain(".wide");
  });

  test("ignores braces inside comments when unwrapping document rules", () => {
    const compiled = compileUserCss(`
@-moz-document domain("github.com") {
  /* not a closer } */
  .container-xl { max-width: none; }
}
`);
    expect(compiled).toContain("/* not a closer } */");
    expect(compiled).toContain(".container-xl { max-width: none; }");
    expect(compiled).not.toMatch(/@-moz-document/u);
    expect(compiled.trim().endsWith("}")).toBe(true);
    expect(compiled.indexOf("/* not a closer")).toBeLessThan(
      compiled.indexOf(".container-xl"),
    );
  });

  test("strips the UserStyle metadata block", () => {
    const compiled = compileUserCss(`/* ==UserStyle==
@name Wide GitHub
@version 1.0.0
==/UserStyle== */

@-moz-document domain("github.com") {
  .container-xl { max-width: none; }
}
`);
    expect(compiled).not.toMatch(/==UserStyle==/u);
    expect(compiled).toContain(".container-xl");
  });

  test("rejects update URLs in UserStyle metadata", () => {
    expect(() =>
      compileUserCss(`/* ==UserStyle==
@name Remote
@updateURL https://evil.test/wide.user.css
==/UserStyle== */
body { color: red; }
`),
    ).toThrow(/update URL/u);
  });

  test("rejects LESS and Stylus preprocessors", () => {
    expect(() =>
      compileUserCss(`/* ==UserStyle==
@name Theme
@preprocessor less
==/UserStyle== */
body { color: red; }
`),
    ).toThrow(/preprocessor/u);
  });

  test("rejects a non-default preprocessor before other metadata faults", () => {
    expect(() =>
      compileUserCss(`/* ==UserStyle==
@name Theme
@updateURL https://evil.test/theme.user.less
@preprocessor less
==/UserStyle== */
@import "theme.less";
body { color: red; }
`),
    ).toThrow(/preprocessor/u);
  });
});

describe("sanitiseCss", () => {
  test("still returns ordinary CSS unchanged", () => {
    expect(sanitiseCss(".advert { display: none; }")).toBe(
      ".advert { display: none; }",
    );
  });

  test("compiles UserCSS matchers and rejects remote url() in rules", () => {
    expect(
      sanitiseCss(
        `@-moz-document url("https://github.com/") { a { color: red; } }`,
      ),
    ).toContain("color: red");
    expect(() =>
      sanitiseCss("a { background: url(https://x.test/a); }"),
    ).toThrow("url(");
    expect(() =>
      sanitiseCss(
        `@-moz-document domain("github.com") { a { background: url(https://x.test/a); } }`,
      ),
    ).toThrow("url(");
  });
});
