import { describe, expect, test } from "vitest";
import {
  compilePageTextReplaceRules,
  isWordBoundary,
  matchPageTextReplaceRuleAt,
  normalizePageTextReplaceRules,
  replacePageTextInString,
  type PageTextReplacePair,
  type PageTextReplaceRules,
} from "./page-text-replace.js";

function pair(
  overrides: Partial<PageTextReplacePair> & Pick<PageTextReplacePair, "find" | "replace">,
): PageTextReplacePair {
  return {
    id: overrides.id ?? "test",
    enabled: overrides.enabled ?? true,
    wholeWord: overrides.wholeWord ?? true,
    caseSensitive: overrides.caseSensitive ?? false,
    caseMode: overrides.caseMode ?? "literal",
    styles: overrides.styles ?? {},
    find: overrides.find,
    replace: overrides.replace,
  };
}

function rules(pairs: PageTextReplacePair[]): PageTextReplaceRules {
  return { pairs };
}

describe("page text replace matching", () => {
  test("longest phrase wins over shorter prefix", () => {
    const compiled = compilePageTextReplaceRules(
      rules([
        pair({ id: "ny", find: "New York", replace: "NY" }),
        pair({ id: "nyc", find: "New York City", replace: "NYC" }),
      ]),
    );
    expect(compiled[0]?.pair.id).toBe("nyc");
    const result = replacePageTextInString(
      "I love New York City pizza.",
      rules([
        pair({ id: "ny", find: "New York", replace: "NY" }),
        pair({ id: "nyc", find: "New York City", replace: "NYC" }),
      ]),
    );
    expect(result.segments.map((segment) => segment.text).join("")).toBe(
      "I love NYC pizza.",
    );
  });

  test("whole-word skips partial matches inside words", () => {
    const result = replacePageTextInString(
      "classic aardvark",
      rules([pair({ find: "a", replace: "b" })]),
    );
    expect(result.replacementCount).toBe(0);
    expect(result.segments[0]?.text).toBe("classic aardvark");
  });

  test("unicode word boundaries treat accented letters as word chars", () => {
    expect(isWordBoundary("caf\u00e9", 0, 4)).toBe(true);
    const compiled = compilePageTextReplaceRules(
      rules([pair({ find: "caf\u00e9", replace: "coffee" })]),
    );
    expect(
      matchPageTextReplaceRuleAt("un caf\u00e9 noir", 3, compiled[0]!),
    ).toBe(4);
  });

  test("case insensitive literal replacement keeps typed replacement", () => {
    const result = replacePageTextInString(
      "Scuba and scuba gear",
      rules([
        pair({ find: "scuba", replace: "SCUBA", caseMode: "literal" }),
      ]),
    );
    expect(result.segments.map((segment) => segment.text).join("")).toBe(
      "SCUBA and SCUBA gear",
    );
  });

  test("matchSource preserves title case on replacement", () => {
    const result = replacePageTextInString(
      "God and god",
      rules([
        pair({
          find: "god",
          replace: "Magical Sky Daddy",
          caseMode: "matchSource",
        }),
      ]),
    );
    expect(result.segments.map((segment) => segment.text).join("")).toBe(
      "Magical Sky Daddy and magical sky daddy",
    );
  });

  test("replacement output is not re-matched", () => {
    const result = replacePageTextInString(
      "a",
      rules([pair({ find: "a", replace: "aa", wholeWord: true })]),
    );
    expect(result.replacementCount).toBe(1);
    expect(result.segments.map((segment) => segment.text).join("")).toBe("aa");
  });

  test("phrases with spaces match when whole-word is on", () => {
    const result = replacePageTextInString(
      "say hello world today",
      rules([pair({ find: "hello world", replace: "hi" })]),
    );
    expect(result.segments.map((segment) => segment.text).join("")).toBe(
      "say hi today",
    );
  });

  test("normalize import drops invalid pairs", () => {
    expect(
      normalizePageTextReplaceRules({
        pairs: [{ find: "ok", replace: "fine" }, { find: 1, replace: "x" }],
      }).pairs,
    ).toEqual([
      expect.objectContaining({ find: "ok", replace: "fine" }),
    ]);
  });
});
