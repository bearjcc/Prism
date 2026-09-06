import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const homeFixture = readFileSync(
  join(repoRoot, "mods", "youtube-home-videos", "fixtures", "home.html"),
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
