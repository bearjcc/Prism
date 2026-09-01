import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import {
  applySearchDirectLinks,
  searchPageHasWrappedLinks,
} from "./search-direct-links.js";

const fixture = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "corpus",
    "userscripts",
    "search-direct-links",
    "fixtures",
    "search-results.html",
  ),
  "utf8",
);

function fixtureDocument(): Document {
  return new JSDOM(fixture, {
    url: "https://www.google.com/search?q=example",
  }).window.document;
}

describe("search.results.directLinks extractor", () => {
  test("unwraps /url and /goto redirects to https destinations", () => {
    const document = fixtureDocument();

    expect(applySearchDirectLinks(document)).toEqual({
      links: [
        {
          id: "result-docs",
          href: "https://docs.example.com/guide",
          title: "Example Docs",
        },
        {
          id: "result-news",
          href: "https://news.example.org/story",
          title: "Example News",
        },
      ],
    });
    expect(document.querySelector("#result-docs")?.getAttribute("href")).toBe(
      "https://docs.example.com/guide",
    );
    expect(document.querySelector("#result-news")?.getAttribute("href")).toBe(
      "https://news.example.org/story",
    );
  });

  test("strips ping tracking and never copies HTML into the JSON result", () => {
    const document = fixtureDocument();
    const result = applySearchDirectLinks(document);

    expect(document.querySelector("#result-docs")?.hasAttribute("ping")).toBe(
      false,
    );
    expect(JSON.stringify(result)).not.toMatch(/</u);
    expect(JSON.stringify(result)).not.toContain("/url?");
  });

  test("searchPageHasWrappedLinks is true until redirects are applied", () => {
    const document = fixtureDocument();
    expect(searchPageHasWrappedLinks(document)).toBe(true);
    applySearchDirectLinks(document);
    expect(searchPageHasWrappedLinks(document)).toBe(false);
  });

  test("leaves javascript destinations and search pagination alone", () => {
    const document = fixtureDocument();
    applySearchDirectLinks(document);

    expect(document.querySelector("#script-trap")?.getAttribute("href")).toBe(
      "/url?q=javascript%3Aalert(1)",
    );
    expect(document.querySelector("#more-results")?.getAttribute("href")).toBe(
      "/search?q=example&start=10",
    );
    expect(document.querySelector("#already-direct")?.getAttribute("href")).toBe(
      "https://wiki.example.net/page",
    );
  });
});
