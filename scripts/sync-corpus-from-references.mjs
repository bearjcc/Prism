import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const references = join(repoRoot, "References");
const corpus = join(repoRoot, "corpus");

function requireFile(path, label) {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path} (run scripts/restore-references.ps1)`);
  }
  return path;
}

function writeCopy(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`copied ${from} -> ${to}`);
}

function sliceHostBlocks(source, limit) {
  const hosts = [];
  for (const line of source.split(/\r?\n/u)) {
    const filter = line.trim();
    if (/^\|\|[a-z0-9.-]+\^$/iu.test(filter) && !hosts.includes(filter)) {
      hosts.push(filter);
      if (hosts.length >= limit) {
        break;
      }
    }
  }
  return hosts;
}

function sliceCosmetics(source, limit) {
  const rules = [];
  for (const line of source.split(/\r?\n/u)) {
    const filter = line.trim();
    if (filter.includes("##") && !filter.startsWith("!") && !rules.includes(filter)) {
      rules.push(filter);
      if (rules.length >= limit) {
        break;
      }
    }
  }
  return rules;
}

writeCopy(
  requireFile(
    join(references, "wide-github", "build", "wide-github.user.css"),
    "Wide GitHub UserCSS",
  ),
  join(corpus, "usercss", "wide-github", "styles", "github.user.css"),
);
writeCopy(
  requireFile(
    join(references, "wide-github", "LICENSE"),
    "Wide GitHub licence",
  ),
  join(corpus, "usercss", "wide-github", "NOTICE.MIT.txt"),
);

writeCopy(
  requireFile(
    join(references, "github-wide", "github-wide.css"),
    "github-wide CSS",
  ),
  join(corpus, "usercss", "github-wide", "styles", "github-wide.css"),
);
writeCopy(
  requireFile(join(references, "github-wide", "LICENSE"), "github-wide licence"),
  join(corpus, "usercss", "github-wide", "NOTICE.MIT.txt"),
);

writeCopy(
  requireFile(
    join(references, "catppuccin-userstyles", "styles", "hacker-news", "catppuccin.user.less"),
    "Catppuccin Hacker News",
  ),
  join(
    corpus,
    "usercss",
    "catppuccin-hacker-news",
    "styles",
    "catppuccin.user.less",
  ),
);
writeCopy(
  requireFile(
    join(references, "catppuccin-userstyles", "LICENSE"),
    "Catppuccin licence",
  ),
  join(corpus, "usercss", "catppuccin-hacker-news", "NOTICE.MIT.txt"),
);

const easylistRoot = join(references, "easylist");
const hostSources = [
  join(easylistRoot, "easylist", "easylist_adservers.txt"),
  join(easylistRoot, "easylist", "easylist_general_block.txt"),
  join(easylistRoot, "easylist.txt"),
].filter((path) => existsSync(path));
if (hostSources.length === 0) {
  throw new Error(
    `Missing EasyList host lists under ${easylistRoot} (run restore-references)`,
  );
}

const hostBlocks = [];
for (const path of hostSources) {
  for (const host of sliceHostBlocks(readFileSync(path, "utf8"), 80)) {
    if (!hostBlocks.includes(host)) {
      hostBlocks.push(host);
    }
    if (hostBlocks.length >= 80) {
      break;
    }
  }
  if (hostBlocks.length >= 80) {
    break;
  }
}

const cosmeticSources = [
  join(easylistRoot, "easylist", "easylist_general_hide.txt"),
  join(easylistRoot, "fanboy-addon", "fanboy_annoyance_general_hide.txt"),
  join(easylistRoot, "easylist_cookie", "easylist_cookie_general_hide.txt"),
].filter((path) => existsSync(path));
if (cosmeticSources.length === 0) {
  throw new Error(`Missing EasyList cosmetic lists under ${easylistRoot}`);
}

const cosmetics = [];
for (const path of cosmeticSources) {
  for (const rule of sliceCosmetics(readFileSync(path, "utf8"), 40)) {
    if (!cosmetics.includes(rule)) {
      cosmetics.push(rule);
    }
    if (cosmetics.length >= 40) {
      break;
    }
  }
  if (cosmetics.length >= 40) {
    break;
  }
}

const filterDir = join(corpus, "filters", "easylist-slice", "filters", "browser");
mkdirSync(filterDir, { recursive: true });
writeFileSync(
  join(filterDir, "easylist-hosts.txt"),
  [
    "! EasyList host-block slice for Prism DNR tests.",
    "! Source: https://github.com/easylist/easylist (GPL-3.0 or CC BY-SA 3.0).",
    "! Not the full list. See Documentation/corpus-licence.md.",
    ...hostBlocks,
    "",
  ].join("\n"),
);
writeFileSync(
  join(filterDir, "easylist-cosmetics.txt"),
  [
    "! EasyList cosmetic slice. compileBrowserFilters ignores these today.",
    "! Source: https://github.com/easylist/easylist (GPL-3.0 or CC BY-SA 3.0).",
    ...cosmetics,
    "",
  ].join("\n"),
);
console.log(
  `wrote ${hostBlocks.length} host blocks and ${cosmetics.length} cosmetics`,
);
