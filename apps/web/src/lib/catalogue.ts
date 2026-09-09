import { capabilitySummary } from "./capability-copy";
import { bundledEntryPath } from "./extension-store";
import { listingStats, type ListingStats } from "./listing-stats";

export type ExploreSort = "popular" | "recent";

export type CapabilityDisclosure = {
  id: string;
  summary: string;
  required: boolean;
};

export type ModVersion = {
  version: string;
  released: string;
  notes: string;
};

export type CatalogueListing = {
  /** URL slug on /mods/[id] */
  id: string;
  /** Runtime package id (prism.*) */
  packageId: string;
  name: string;
  author: string;
  site: string;
  siteHost: string;
  version: string;
  updated: string;
  summary: string;
  description: string;
  runtime: "native" | "userscript";
  scopes: readonly string[];
  bundledEntry: string;
  previewSrc?: string;
  previewAlt?: string;
  capabilities: CapabilityDisclosure[];
  versions: ModVersion[];
};

export type CatalogueMod = CatalogueListing & ListingStats;

export const SITE_CHIPS = ["youtube.com", "linkedin.com", "any site"] as const;

/** First-party tracer mods shipped bundled in the Prism extension. */
export const LISTINGS: CatalogueListing[] = [
  {
    id: "kitten-ad-replace",
    packageId: "prism.kitten-ad-replace",
    name: "Kitten ad replace",
    author: "Prism",
    site: "Any site",
    siteHost: "any site",
    version: "1.0.0",
    updated: "2026-08-20",
    summary: "Replace ad slots with kittens.",
    description:
      "Uses declared visual slot replacement with bundled SVG images. The mod never receives page HTML. Optional browser block and egress stay off until granted.",
    runtime: "native",
    scopes: ["<all_urls>"],
    bundledEntry: bundledEntryPath("prism.kitten-ad-replace"),
    previewSrc: "/previews/kitten-ad-replace.webp",
    previewAlt: "Browser page with ad slots replaced by kitten images",
    capabilities: [
      {
        id: "visual.ad-slot.replace",
        summary: capabilitySummary("visual.ad-slot.replace"),
        required: true,
      },
      {
        id: "network.browser.block",
        summary: capabilitySummary("network.browser.block"),
        required: false,
      },
      {
        id: "network.egress",
        summary: capabilitySummary("network.egress"),
        required: false,
      },
    ],
    versions: [
      { version: "1.0.0", released: "2026-08-20", notes: "First public package." },
    ],
  },
  {
    id: "youtube-home-videos",
    packageId: "prism.youtube-home-videos",
    name: "YouTube Home, videos only",
    author: "Prism",
    site: "youtube.com",
    siteHost: "youtube.com",
    version: "1.0.0",
    updated: "2026-08-22",
    summary: "Home feed shows video units only.",
    description:
      "An allowlist UI over extractor-classified video items. Shorts, ads, and non-video shelves stay out of the mounted list.",
    runtime: "native",
    scopes: ["https://www.youtube.com/"],
    bundledEntry: bundledEntryPath("prism.youtube-home-videos"),
    previewSrc: "/previews/youtube-home-videos.webp",
    previewAlt: "YouTube Home feed showing video thumbnails only",
    capabilities: [
      {
        id: "youtube.home.allowlist",
        summary: capabilitySummary("youtube.home.allowlist"),
        required: true,
      },
    ],
    versions: [
      { version: "1.0.0", released: "2026-08-22", notes: "First public package." },
    ],
  },
  {
    id: "youtube-reddit-comments",
    packageId: "prism.youtube-reddit-comments",
    name: "Reddit comments on YouTube",
    author: "Prism",
    site: "youtube.com",
    siteHost: "youtube.com",
    version: "1.0.0",
    updated: "2026-08-24",
    summary: "Show Reddit comments on a watch page.",
    description:
      "Cross-site extract on watch pages. The extension fetches and parses Reddit in the background. The mod receives JSON fields only, never HTML or cookies.",
    runtime: "native",
    scopes: ["https://www.youtube.com/watch*"],
    bundledEntry: bundledEntryPath("prism.youtube-reddit-comments"),
    previewSrc: "/previews/youtube-reddit-comments.webp",
    previewAlt: "YouTube watch page with Reddit comments alongside the video",
    capabilities: [
      {
        id: "visual.ad-slot.replace",
        summary: capabilitySummary("visual.ad-slot.replace"),
        required: true,
      },
      {
        id: "youtube.watch.videoId",
        summary: capabilitySummary("youtube.watch.videoId"),
        required: true,
      },
      {
        id: "reddit.comments.search",
        summary: capabilitySummary("reddit.comments.search"),
        required: false,
      },
    ],
    versions: [
      { version: "1.0.0", released: "2026-08-24", notes: "First public package." },
    ],
  },
  {
    id: "linkedin-home-first-degree",
    packageId: "prism.linkedin-home-first-degree",
    name: "LinkedIn Home, first degree",
    author: "Prism",
    site: "linkedin.com",
    siteHost: "linkedin.com",
    version: "1.0.0",
    updated: "2026-09-08",
    summary: "Home feed shows first-degree and followed-page posts only.",
    description:
      "An allowlist filter over the signed-in LinkedIn Home feed. Extended network posts, promoted items, activity reshares, and recommendation modules are stripped in place.",
    runtime: "native",
    scopes: ["https://www.linkedin.com/*"],
    bundledEntry: bundledEntryPath("prism.linkedin-home-first-degree"),
    previewSrc: "/previews/linkedin-home-first-degree.webp",
    previewAlt: "LinkedIn Home feed showing first-degree and followed-page posts only",
    capabilities: [
      {
        id: "linkedin.home.allowlist",
        summary: capabilitySummary("linkedin.home.allowlist"),
        required: true,
      },
    ],
    versions: [
      {
        version: "1.0.0",
        released: "2026-09-08",
        notes: "First public package.",
      },
    ],
  },
];

export function modPreviewProps(mod: CatalogueListing): { src: string; alt: string } {
  return {
    src: mod.previewSrc ?? `/previews/${mod.id}.webp`,
    alt: mod.previewAlt ?? mod.name,
  };
}

export function catalogue(): CatalogueMod[] {
  return LISTINGS.map((listing) => ({ ...listing, ...listingStats(listing.id) }));
}

export function getMod(id: string): CatalogueMod | undefined {
  return catalogue().find((mod) => mod.id === id);
}

export function filterCatalogue(
  mods: CatalogueMod[],
  query: string,
  sort: ExploreSort,
  siteHost: string | null,
): CatalogueMod[] {
  const q = query.trim().toLowerCase();
  let list = mods.filter((mod) => {
    if (siteHost && mod.siteHost !== siteHost) {
      return false;
    }
    if (!q) {
      return true;
    }
    return (
      mod.name.toLowerCase().includes(q) ||
      mod.author.toLowerCase().includes(q) ||
      mod.site.toLowerCase().includes(q) ||
      mod.summary.toLowerCase().includes(q) ||
      mod.packageId.toLowerCase().includes(q)
    );
  });
  if (sort === "popular") {
    list = [...list].sort((a, b) => {
      if (b.installs !== a.installs) {
        return b.installs - a.installs;
      }
      if (a.updated !== b.updated) {
        return a.updated < b.updated ? 1 : -1;
      }
      return a.id.localeCompare(b.id);
    });
  } else {
    list = [...list].sort((a, b) => {
      if (a.updated !== b.updated) {
        return a.updated < b.updated ? 1 : -1;
      }
      return a.id.localeCompare(b.id);
    });
  }
  return list;
}

export function formatInstalls(n: number): string {
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }
  return String(n);
}

export function formatRating(mod: CatalogueMod): string {
  if (mod.rating === null || mod.ratingCount === 0) {
    return "No ratings";
  }
  return `${mod.rating}/5`;
}
