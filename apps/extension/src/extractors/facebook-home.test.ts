import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { describe, expect, test } from "vitest";
import {
  classifyFacebookHomeItem,
  extractFacebookHome,
  findFacebookHomeFeed,
  facebookHomeFeedChildren,
  isFacebookHomePath,
} from "./facebook-home.js";

const modRoot = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "mods",
  "facebook-home-friends",
);

const fixturePath = join(modRoot, "fixtures", "feed.html");
const liveFixturePath = join(modRoot, "fixtures", "feed-live.html");

const GOLDEN_CLASSIFICATIONS: Record<
  string,
  { allowlisted: boolean; reason: string }
> = {
  friend: { allowlisted: true, reason: "friend" },
  sponsored: { allowlisted: false, reason: "sponsored" },
  suggested: { allowlisted: false, reason: "suggested" },
  page: { allowlisted: false, reason: "page" },
  group: { allowlisted: false, reason: "group" },
  "activity-reshare": { allowlisted: false, reason: "activity-reshare" },
  module: { allowlisted: false, reason: "module" },
};

function feedChildren(document: Document): Element[] {
  const feed = findFacebookHomeFeed(document);
  expect(feed).toBeDefined();
  return facebookHomeFeedChildren(feed!);
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

describe("extractFacebookHome", () => {
  test("isFacebookHomePath matches Home routes only", () => {
    expect(isFacebookHomePath("/")).toBe(true);
    expect(isFacebookHomePath("/home")).toBe(true);
    expect(isFacebookHomePath("/home/")).toBe(true);
    expect(isFacebookHomePath("/messages")).toBe(false);
    expect(isFacebookHomePath("/groups")).toBe(false);
    expect(isFacebookHomePath("/marketplace")).toBe(false);
  });

  test("findFacebookHomeFeed returns the Home feed root from feed.html", () => {
    const dom = new JSDOM(readFileSync(fixturePath, "utf8"), {
      url: "https://www.facebook.com/",
    });
    const feed = findFacebookHomeFeed(dom.window.document);
    expect(feed?.getAttribute("data-facebook-home-feed")).toBe("");
    expect(feed?.children.length).toBeGreaterThan(0);
  });

  test("classifies feed.html children per data-fixture-kind", () => {
    const dom = new JSDOM(readFileSync(fixturePath, "utf8"), {
      url: "https://www.facebook.com/",
    });
    for (const child of feedChildren(dom.window.document)) {
      const kind = child.getAttribute("data-fixture-kind");
      expect(kind).not.toBeNull();
      const expected = GOLDEN_CLASSIFICATIONS[kind!];
      expect(expected).toBeDefined();
      const item = classifyFacebookHomeItem(child);
      expect(item.allowlisted).toBe(expected.allowlisted);
      expect(item.reason).toBe(expected.reason);
      expect(item.id.length).toBeGreaterThan(0);
    }
  });

  test("extractFacebookHome returns JSON without HTML fields from feed.html", () => {
    const dom = new JSDOM(readFileSync(fixturePath, "utf8"), {
      url: "https://www.facebook.com/",
    });
    const result = extractFacebookHome(dom.window.document);
    assertNoHtmlFields(result);
    expect(JSON.stringify(result)).not.toMatch(/</u);
    expect(result.items).toHaveLength(7);
    expect(result.items.filter((item) => item.allowlisted)).toHaveLength(1);
  });

  test("classifies live-shaped feed-live.html children", () => {
    const dom = new JSDOM(readFileSync(liveFixturePath, "utf8"), {
      url: "https://www.facebook.com/",
    });
    for (const child of feedChildren(dom.window.document)) {
      const kind = child.getAttribute("data-fixture-kind");
      expect(kind).not.toBeNull();
      const expected = GOLDEN_CLASSIFICATIONS[kind!];
      expect(expected).toBeDefined();
      const item = classifyFacebookHomeItem(child);
      expect(item.allowlisted).toBe(expected.allowlisted);
      expect(item.reason).toBe(expected.reason);
    }
  });

  test("does not find feed on non-Home Facebook URLs", () => {
    const dom = new JSDOM(readFileSync(fixturePath, "utf8"), {
      url: "https://www.facebook.com/messages",
    });
    expect(findFacebookHomeFeed(dom.window.document)).toBeUndefined();
  });
});
