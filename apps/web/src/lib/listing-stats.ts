export type ListingStats = {
  installs: number;
  rating: number | null;
  ratingCount: number;
};

export const EMPTY_LISTING_STATS: ListingStats = {
  installs: 0,
  rating: null,
  ratingCount: 0,
};

const rows = new Map<string, ListingStats>();

function inVitest(): boolean {
  return process.env.VITEST === "true";
}

export function listingStats(id: string): ListingStats {
  return rows.get(id) ?? EMPTY_LISTING_STATS;
}

export function seedListingStatsForTests(seed: Readonly<Record<string, ListingStats>>): void {
  if (!inVitest()) {
    throw new Error("Listing stats seed is test-only.");
  }
  rows.clear();
  for (const [id, stats] of Object.entries(seed)) {
    rows.set(id, stats);
  }
}

export function resetListingStatsForTests(): void {
  if (!inVitest()) {
    throw new Error("Listing stats reset is test-only.");
  }
  rows.clear();
}
