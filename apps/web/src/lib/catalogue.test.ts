import { afterEach, describe, expect, it } from "vitest";
import { catalogue, filterCatalogue, formatInstalls, formatRating } from "./catalogue";
import { TEST_LISTING_STATS } from "./listing-stats.fixture";
import { resetListingStatsForTests, seedListingStatsForTests } from "./listing-stats";

describe("filterCatalogue", () => {
  afterEach(() => {
    resetListingStatsForTests();
  });

  it("reads popular order from stats rows, not listing copy", () => {
    seedListingStatsForTests(TEST_LISTING_STATS);
    const list = filterCatalogue(catalogue(), "", "popular", null);
    expect(list[0]?.id).toBe("youtube-home-videos");
    expect(list[0]?.installs).toBe(40210);
    expect(formatInstalls(list[0]?.installs ?? 0)).toBe("40.2k");
    expect(formatRating(list[0]!)).toBe("4.8/5");
  });

  it("shows empty stats when the store has no rows", () => {
    const list = filterCatalogue(catalogue(), "", "popular", null);
    expect(list.every((mod) => mod.installs === 0 && mod.rating === null && mod.ratingCount === 0)).toBe(
      true,
    );
    expect(formatInstalls(0)).toBe("0");
    expect(formatRating(list[0]!)).toBe("No ratings");
  });

  it("filters by site chip", () => {
    const youtube = filterCatalogue(catalogue(), "", "popular", "youtube.com");
    expect(youtube.every((m) => m.siteHost === "youtube.com")).toBe(true);
    expect(youtube.length).toBe(2);

    const linkedin = filterCatalogue(catalogue(), "", "popular", "linkedin.com");
    expect(linkedin.map((m) => m.id)).toEqual(["linkedin-home-first-degree"]);
  });

  it("matches name search", () => {
    const list = filterCatalogue(catalogue(), "kitten", "recent", null);
    expect(list.map((m) => m.id)).toEqual(["kitten-ad-replace"]);
  });

  it("tie-breaks stable popular order when all installs are zero", () => {
    const list = filterCatalogue(catalogue(), "", "popular", null);
    expect(list.every((mod) => mod.installs === 0)).toBe(true);
    expect(list.map((m) => m.id)).toEqual([
      "youtube-reddit-comments",
      "youtube-home-videos",
      "kitten-ad-replace",
    ]);
  });
});

describe("catalogue listings", () => {
  it("exposes preview paths and honest empty stats in production", () => {
    for (const mod of catalogue()) {
      expect(mod.previewSrc).toBe(`/previews/${mod.id}.webp`);
      expect(mod.previewAlt.length).toBeGreaterThan(0);
      expect(mod.installs).toBe(0);
      expect(mod.rating).toBeNull();
      expect(mod.ratingCount).toBe(0);
    }
  });
});
