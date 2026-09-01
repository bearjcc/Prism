import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".zip",
  ".gz",
  ".wasm",
  ".bin",
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findNonAscii(text) {
  const messages = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (let j = 0; j < line.length; j += 1) {
      if (line.charCodeAt(j) > 127) {
        messages.push(`non-ASCII byte at line ${i + 1} column ${j + 1}`);
        break;
      }
    }
  }
  return messages;
}

export function findUsSpellings(text, words) {
  if (words.length === 0) {
    return [];
  }
  const pattern = new RegExp(`\\b(${words.map(escapeRegExp).join("|")})\\b`, "gi");
  const messages = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    pattern.lastIndex = 0;
    let match = pattern.exec(line);
    while (match) {
      messages.push(
        `US spelling "${match[0]}" at line ${i + 1} column ${match.index + 1}`,
      );
      match = pattern.exec(line);
    }
  }
  return messages;
}

export function scanText(file, text, words) {
  const messages = findNonAscii(text).map((m) => `${file}: ${m}`);
  for (const m of findUsSpellings(text, words)) {
    messages.push(`${file}: ${m}`);
  }
  return { ok: messages.length === 0, messages };
}

function git(root, args, encoding = "utf8") {
  return execFileSync("git", args, { cwd: root, encoding });
}

function loadWords(wordListPath) {
  return readFileSync(wordListPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function isBinaryPath(filePath) {
  return BINARY_EXT.has(extname(filePath).toLowerCase());
}

function skipTrackedFile(filePath) {
  const normalised = filePath.replaceAll("\\", "/");
  return (
    /\/(styles|filters)\//u.test(normalised) && normalised.startsWith("corpus/")
  );
}

function skipSpellingFor(filePath) {
  const normalised = filePath.replaceAll("\\", "/");
  if (skipTrackedFile(filePath)) {
    return true;
  }
  if (normalised === "LICENSE") {
    return true;
  }
  if (normalised === "scripts/us-spellings.txt") {
    return true;
  }
    if (/\.test\.(ts|tsx|mjs|js)$/.test(normalised)) {
    return true;
  }
  return false;
}

function listIndexBlobs(root) {
  const out = git(root, ["ls-files", "-s", "-z"]);
  const entries = [];
  for (const record of out.split("\0").filter(Boolean)) {
    const tab = record.indexOf("\t");
    const meta = record.slice(0, tab);
    const filePath = record.slice(tab + 1);
    const hash = meta.split(" ")[1];
    entries.push({ filePath, hash });
  }
  return entries;
}

function listUntracked(root) {
  const out = git(root, ["ls-files", "-o", "--exclude-standard", "-z"]);
  return out.split("\0").filter(Boolean);
}

function readBlob(root, hash) {
  return git(root, ["cat-file", "blob", hash], "buffer").toString("utf8");
}

export function checkRepository(root, words) {
  const messages = [];
  const seen = new Set();

  for (const { filePath, hash } of listIndexBlobs(root)) {
    seen.add(filePath);
    if (isBinaryPath(filePath) || skipTrackedFile(filePath)) {
      continue;
    }
    const spellingWords = skipSpellingFor(filePath) ? [] : words;
    const result = scanText(filePath, readBlob(root, hash), spellingWords);
    messages.push(...result.messages);
  }

  for (const filePath of listUntracked(root)) {
    if (seen.has(filePath) || isBinaryPath(filePath) || skipTrackedFile(filePath)) {
      continue;
    }
    const spellingWords = skipSpellingFor(filePath) ? [] : words;
    const text = readFileSync(join(root, filePath), "utf8");
    const result = scanText(filePath, text, spellingWords);
    messages.push(...result.messages);
  }

  return { ok: messages.length === 0, messages };
}

const thisFile = fileURLToPath(import.meta.url);
const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).toLowerCase() === thisFile.toLowerCase();

if (isMain) {
  const root = join(dirname(thisFile), "..");
  const words = loadWords(join(dirname(thisFile), "us-spellings.txt"));
  const result = checkRepository(root, words);
  if (!result.ok) {
    for (const message of result.messages) {
      console.error(message);
    }
    process.exit(1);
  }
}
