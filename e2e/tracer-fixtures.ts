import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const homeFixture = readFileSync(
  join(repoRoot, "mods", "youtube-home-videos", "fixtures", "home.html"),
  "utf8",
);

export const linkedinFeedFixture = readFileSync(
  join(repoRoot, "mods", "linkedin-home-first-degree", "fixtures", "feed.html"),
  "utf8",
);

export const facebookFeedFixture = readFileSync(
  join(repoRoot, "mods", "facebook-home-friends", "fixtures", "feed.html"),
  "utf8",
);

export const watchFixture = readFileSync(
  join(
    repoRoot,
    "mods",
    "youtube-reddit-comments",
    "fixtures",
    "watch.html",
  ),
  "utf8",
);

export const watchLiveFixture = readFileSync(
  join(
    repoRoot,
    "mods",
    "youtube-reddit-comments",
    "fixtures",
    "watch-live.html",
  ),
  "utf8",
);
