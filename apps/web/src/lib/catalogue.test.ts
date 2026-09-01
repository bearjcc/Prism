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
    const list = filterCatalogue(catalogue(), "", "popular", "reddit.com");
    expect(list.every((m) => m.siteHost === "reddit.com")).toBe(true);
    expect(list.length).toBe(1);
  });

  it("matches name search", () => {
    const list = filterCatalogue(catalogue(), "kitten", "recent", null);
    expect(list.map((m) => m.id)).toEqual(["kitten-ad-replace"]);
  });
});
