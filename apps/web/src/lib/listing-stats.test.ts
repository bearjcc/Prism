import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listingStats, resetListingStatsForTests, seedListingStatsForTests } from "./listing-stats";
import { TEST_LISTING_STATS } from "./listing-stats.fixture";

describe("listing stats store", () => {
  beforeEach(() => {
    resetListingStatsForTests();
  });

  afterEach(() => {
    resetListingStatsForTests();
  });

  it("returns empty rows until tests seed the table", () => {
    expect(listingStats("youtube-home-videos")).toEqual({
      installs: 0,
      rating: null,
      ratingCount: 0,
    });
  });

  it("reads installs and ratings from seeded rows", () => {
    seedListingStatsForTests(TEST_LISTING_STATS);
    expect(listingStats("youtube-home-videos")).toEqual({
      installs: 40210,
      rating: 4.8,
      ratingCount: 210,
    });
  });
});
