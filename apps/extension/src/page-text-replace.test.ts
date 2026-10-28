/** @vitest-environment jsdom */
import { describe, expect, test } from "vitest";
import {
  createPageTextReplaceSession,
  shouldProcessTextNode,
} from "./page-text-replace.js";
import { toPageTextReplaceRules } from "./word-replacer-settings.js";

const scubaRule = {
  pairs: [
    {
      id: "1",
      find: "scuba",
      replace: "SCUBA",
      enabled: true,
      wholeWord: true,
      caseSensitive: false,
      caseMode: "literal" as const,
      styles: {},
    },
  ],
};

describe("page text replace DOM", () => {
  test("skips pre and contenteditable text", () => {
    document.body.innerHTML = `
      <p id="ok">scuba club</p>
      <pre>scuba</pre>
      <div contenteditable="true">scuba</div>
    `;
    const processed = new WeakSet<Text>();
    expect(
      shouldProcessTextNode(document.querySelector("pre")!.firstChild as Text, processed),
    ).toBe(false);
    expect(
      shouldProcessTextNode(
        document.querySelector("[contenteditable]")!.firstChild as Text,
        processed,
      ),
    ).toBe(false);
    expect(
      shouldProcessTextNode(document.querySelector("#ok")!.firstChild as Text, processed),
    ).toBe(true);
  });

  test("undo restores replaced paragraph text", () => {
    document.body.innerHTML = "<p>scuba day</p>";
    const session = createPageTextReplaceSession({
      document,
      rules: toPageTextReplaceRules(scubaRule),
    });
    expect(document.body.textContent).toBe("SCUBA day");
    session.stop();
    expect(document.body.textContent).toBe("scuba day");
  });

  test("handles a large fixture without timing out", () => {
    const paragraph = document.createElement("p");
    paragraph.textContent = "word ".repeat(20_000);
    document.body.replaceChildren(paragraph);
    const started = performance.now();
    const session = createPageTextReplaceSession({
      document,
      rules: toPageTextReplaceRules({
        pairs: [
          {
            id: "1",
            find: "word",
            replace: "term",
            enabled: true,
            wholeWord: true,
            caseSensitive: true,
            caseMode: "literal",
            styles: {},
          },
        ],
      }),
    });
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(paragraph.textContent?.slice(0, 8)).toBe("term ter");
    session.stop();
  });
});
