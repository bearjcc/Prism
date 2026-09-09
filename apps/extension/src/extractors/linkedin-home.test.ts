import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import {
  classifyLinkedinHomeItem,
  extractLinkedinHome,
  findLinkedinHomeFeed,
  linkedinHomeFeedChildren,
} from "./linkedin-home.js";

const modRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "mods",
  "linkedin-home-first-degree",
);

const fixturePath = join(modRoot, "fixtures", "feed.html");
const liveFixturePath = join(modRoot, "fixtures", "feed-live.html");

const GOLDEN_CLASSIFICATIONS: Record<
  string,
  { allowlisted: boolean; reason: string }
> = {
  "first-degree": { allowlisted: true, reason: "first-degree" },
  "followed-page": { allowlisted: true, reason: "followed-page" },
  "second-degree": { allowlisted: false, reason: "extended-network" },
  promoted: { allowlisted: false, reason: "promoted" },
  "activity-reshare": { allowlisted: false, reason: "activity-reshare" },
  module: { allowlisted: false, reason: "module" },
};

function feedChildren(document: Document): Element[] {
  const feed = findLinkedinHomeFeed(document);
  expect(feed).toBeDefined();
  return linkedinHomeFeedChildren(feed!);
}

function assertNoHtmlFields(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertNoHtmlFields(entry, `${path}[${index}]`);
    });
    return;
  }
  if (typeof value === "object" && value !== null) {
    expect(value, path).not.toHaveProperty("html");
    expect(value, path).not.toHaveProperty("innerHTML");
    for (const [key, entry] of Object.entries(value)) {
      assertNoHtmlFields(entry, `${path}.${key}`);
    }
  }
}

describe("extractLinkedinHome", () => {
  test("findLinkedinHomeFeed returns the Home feed root from feed.html", () => {
    const dom = new JSDOM(readFileSync(fixturePath, "utf8"), {
      url: "https://www.linkedin.com/feed",
    });
    const feed = findLinkedinHomeFeed(dom.window.document);
    expect(feed?.getAttribute("data-linkedin-home-feed")).toBe("");
    expect(feed?.children.length).toBeGreaterThan(0);
  });

  test("classifies feed.html children per data-fixture-kind", () => {
    const dom = new JSDOM(readFileSync(fixturePath, "utf8"), {
      url: "https://www.linkedin.com/feed",
    });
    for (const child of feedChildren(dom.window.document)) {
      const kind = child.getAttribute("data-fixture-kind");
      expect(kind).not.toBeNull();
      const expected = GOLDEN_CLASSIFICATIONS[kind!];
      expect(expected).toBeDefined();
      const item = classifyLinkedinHomeItem(child);
      expect(item.allowlisted).toBe(expected.allowlisted);
      expect(item.reason).toBe(expected.reason);
      expect(item.id.length).toBeGreaterThan(0);
    }
  });

  test("extractLinkedinHome returns JSON without HTML fields from feed.html", () => {
    const dom = new JSDOM(readFileSync(fixturePath, "utf8"), {
      url: "https://www.linkedin.com/feed",
    });
    const result = extractLinkedinHome(dom.window.document);
    assertNoHtmlFields(result);
    expect(JSON.stringify(result)).not.toMatch(/</u);
    expect(result.items).toHaveLength(6);
    expect(result.items.filter((item) => item.allowlisted)).toHaveLength(2);
  });

  test("classifies live-shaped feed-live.html children", () => {
    const dom = new JSDOM(readFileSync(liveFixturePath, "utf8"), {
      url: "https://www.linkedin.com/feed",
    });
    for (const child of feedChildren(dom.window.document)) {
      const kind = child.getAttribute("data-fixture-kind");
      expect(kind).not.toBeNull();
      const expected = GOLDEN_CLASSIFICATIONS[kind!];
      expect(expected).toBeDefined();
      const item = classifyLinkedinHomeItem(child);
      expect(item.allowlisted).toBe(expected.allowlisted);
      expect(item.reason).toBe(expected.reason);
    }
  });

  test("extractLinkedinHome handles live-shaped markup", () => {
    const dom = new JSDOM(readFileSync(liveFixturePath, "utf8"), {
      url: "https://www.linkedin.com/feed",
    });
    const result = extractLinkedinHome(dom.window.document);
    assertNoHtmlFields(result);
    expect(result.items).toHaveLength(6);
    expect(result.items.filter((item) => item.allowlisted)).toHaveLength(2);
  });
});
