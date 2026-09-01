import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_ROOT_MARKDOWN = new Set([
  "README.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
]);

const ALLOWED_HIDDEN_FILES = new Set([
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".aislopignore",
  ".aislop/config.yml",
]);

export function isUnpublishablePath(filePath) {
  const normalised = filePath.replaceAll("\\", "/");
  if (normalised.endsWith(".canvas.tsx")) {
    return true;
  }
  if (!normalised.includes("/") && normalised.endsWith(".md")) {
    if (!ALLOWED_ROOT_MARKDOWN.has(normalised)) {
      return true;
    }
  }
  if (hasHiddenSegment(normalised) && !isAllowedHidden(normalised)) {
    return true;
  }
  return false;
}

function hasHiddenSegment(normalised) {
  return normalised.split("/").some((part) => part.startsWith("."));
}

function isAllowedHidden(normalised) {
  if (ALLOWED_HIDDEN_FILES.has(normalised)) {
    return true;
  }
  return normalised.startsWith(".github/workflows/");
}

export function findUnpublishablePaths(paths) {
  return paths.filter((filePath) => isUnpublishablePath(filePath));
}

export function checkPublishableTree(paths) {
  const forbidden = findUnpublishablePaths(paths);
  return {
    ok: forbidden.length === 0,
    messages: forbidden.map(
      (filePath) =>
        `${filePath}: not part of the published source tree (build, test, and scan inputs only)`,
    ),
  };
}

const thisFile = fileURLToPath(import.meta.url);
const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).toLowerCase() === thisFile.toLowerCase();

if (isMain) {
  const root = join(dirname(thisFile), "..");
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
  });
  const result = checkPublishableTree(out.split("\0").filter(Boolean));
  if (!result.ok) {
    for (const message of result.messages) {
      console.error(message);
    }
    process.exit(1);
  }
}
