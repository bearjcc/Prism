import type { ListingStats } from "./listing-stats";

/** Rows for automated tests only. Not loaded by the website. */
export const TEST_LISTING_STATS: Readonly<Record<string, ListingStats>> = {
  "kitten-ad-replace": { installs: 12840, rating: 4.6, ratingCount: 91 },
  "youtube-home-videos": { installs: 40210, rating: 4.8, ratingCount: 210 },
  "youtube-reddit-comments": { installs: 18770, rating: 4.2, ratingCount: 64 },
  "github-quiet-files": { installs: 9330, rating: 4.4, ratingCount: 40 },
  "reddit-feed-expand": { installs: 22100, rating: 4.1, ratingCount: 88 },
};
