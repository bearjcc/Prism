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
  id: string;
  name: string;
  author: string;
  site: string;
  siteHost: string;
  version: string;
  updated: string;
  summary: string;
  description: string;
  screenshotLabel: string;
  screenshotHue: number;
  screenshotScene: "kittens" | "yt-home" | "yt-watch" | "gh-files" | "reddit-feed";
  capabilities: CapabilityDisclosure[];
  versions: ModVersion[];
};

export type CatalogueMod = CatalogueListing & ListingStats;

export const SITE_CHIPS = [
  "youtube.com",
  "reddit.com",
  "github.com",
  "any site",
] as const;

export const LISTINGS: CatalogueListing[] = [
  {
    id: "kitten-ad-replace",
    name: "Kitten ad replace",
    author: "Prism",
    site: "Any site",
    siteHost: "any site",
    version: "0.1.0",
    updated: "2026-08-20",
    summary: "Replace ad slots with kittens.",
    description:
      "Uses declared visual slot replacement. The mod never receives page HTML. Optional egress stays off until granted.",
    screenshotLabel: "Feed with kitten tiles",
    screenshotHue: 12,
    screenshotScene: "kittens",
    capabilities: [
      {
        id: "visual.slots.replace",
        summary: "Replace marked ad slots with bundled images.",
        required: true,
      },
    ],
    versions: [
      { version: "0.1.0", released: "2026-08-20", notes: "First public package." },
    ],
  },
  {
    id: "youtube-home-videos",
    name: "YouTube Home, videos only",
    author: "Prism",
    site: "youtube.com",
    siteHost: "youtube.com",
    version: "0.1.0",
    updated: "2026-08-22",
    summary: "Home feed shows video units only.",
    description:
      "An allowlist UI over extractor-classified video items. Shorts, ads, and non-video shelves stay out of the mounted list.",
    screenshotLabel: "YouTube Home, videos only",
    screenshotHue: 0,
    screenshotScene: "yt-home",
    capabilities: [
      {
        id: "ui.allowlist",
        summary: "Mount only video items from the YouTube Home extractor.",
        required: true,
      },
    ],
    versions: [
      { version: "0.1.0", released: "2026-08-22", notes: "First public package." },
    ],
  },
  {
    id: "youtube-reddit-comments",
    name: "Reddit comments on YouTube",
    author: "Prism",
    site: "youtube.com",
    siteHost: "youtube.com",
    version: "0.1.0",
    updated: "2026-08-24",
    summary: "Show Reddit comments on a watch page.",
    description:
      "Cross-site extract. The extension fetches and parses Reddit. The mod receives JSON fields only, never HTML or cookies.",
    screenshotLabel: "Watch page with Reddit thread",
    screenshotHue: 18,
    screenshotScene: "yt-watch",
    capabilities: [
      {
        id: "extract.youtube.watch",
        summary: "Read the watch video id from the page URL.",
        required: true,
      },
      {
        id: "reddit.comments.search",
        summary: "Search Reddit for comments about this video. Off until granted.",
        required: false,
      },
    ],
    versions: [
      { version: "0.1.0", released: "2026-08-24", notes: "First public package." },
    ],
  },
  {
    id: "github-quiet-files",
    name: "GitHub quiet files",
    author: "Prism",
    site: "github.com",
    siteHost: "github.com",
    version: "0.3.1",
    updated: "2026-07-02",
    summary: "Hide noise on repository file trees.",
    description:
      "Visual hide of declared file-browser chrome. No network. No userscript runtime.",
    screenshotLabel: "Repository tree, quieter",
    screenshotHue: 220,
    screenshotScene: "gh-files",
    capabilities: [
      {
        id: "visual.hide",
        summary: "Hide listed file-browser regions on github.com.",
        required: true,
      },
    ],
    versions: [
      { version: "0.3.1", released: "2026-07-02", notes: "Match current file tree." },
      { version: "0.3.0", released: "2026-05-11", notes: "Initial hide list." },
    ],
  },
  {
    id: "reddit-feed-expand",
    name: "Reddit feed expand",
    author: "Prism",
    site: "reddit.com",
    siteHost: "reddit.com",
    version: "1.2.0",
    updated: "2026-08-01",
    summary: "Widen the feed and drop the right rail.",
    description:
      "UserCSS-origin visual change, sanitised into visual capabilities. No page JavaScript from the author.",
    screenshotLabel: "Wide Reddit feed",
    screenshotHue: 25,
    screenshotScene: "reddit-feed",
    capabilities: [
      {
        id: "visual.hide",
        summary: "Hide the right sidebar on feed pages.",
        required: true,
      },
      {
        id: "visual.css",
        summary: "Widen the main column on reddit.com.",
        required: true,
      },
    ],
    versions: [
      { version: "1.2.0", released: "2026-08-01", notes: "Sanitised UserCSS import." },
    ],
  },
];

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
      mod.summary.toLowerCase().includes(q)
    );
  });
  if (sort === "popular") {
    list = [...list].sort((a, b) => {
      if (b.installs !== a.installs) {
        return b.installs - a.installs;
      }
      return a.updated < b.updated ? 1 : -1;
    });
  } else {
    list = [...list].sort((a, b) => (a.updated < b.updated ? 1 : -1));
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
