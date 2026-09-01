import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_KEYS = ["id", "url", "ref", "sha", "dest"];
const SHA_RE = /^[0-9a-f]{40}$/;

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 && value === value.trim();
}

function isHttpsGitUrl(url) {
  try {
    const parsed = new globalThis.URL(url);
    return (
      parsed.protocol === "https:" &&
      parsed.username === "" &&
      parsed.password === "" &&
      parsed.pathname.endsWith(".git")
    );
  } catch {
    return false;
  }
}

export function assertHeadMatchesLockSha(id, expectedSha, head) {
  if (head !== expectedSha) {
    throw new Error(`SHA mismatch for ${id}: expected ${expectedSha}, got ${head}`);
  }
}

export function restoreScriptsCompareHeadToSha(shSource, ps1Source) {
  const shOk = /if head != sha:/.test(shSource);
  const ps1Ok = /if \(\$head -ne \$sha\)/.test(ps1Source);
  return { ok: shOk && ps1Ok, shOk, ps1Ok };
}

export function verifyReferencesLock(data) {
  const messages = [];

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, messages: ["lockfile must be a JSON object"] };
  }

  if (data.version == null || data.version === "") {
    messages.push("missing version");
  }

  if (!Array.isArray(data.references)) {
    messages.push("missing references array");
    return { ok: false, messages };
  }

  const ids = new Map();
  const dests = new Map();

  data.references.forEach((entry, index) => {
    const label = `references[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      messages.push(`${label} must be an object`);
      return;
    }

    for (const key of REQUIRED_KEYS) {
      if (!isNonEmptyString(entry[key])) {
        messages.push(`${label} missing ${key}`);
      }
    }

    const id = entry.id;
    const dest = entry.dest;
    const sha = entry.sha;
    const url = entry.url;

    if (isNonEmptyString(id)) {
      if (ids.has(id)) {
        messages.push(`duplicate id "${id}" (${label} and ${ids.get(id)})`);
      } else {
        ids.set(id, label);
      }
    }

    if (isNonEmptyString(dest)) {
      if (dests.has(dest)) {
        messages.push(`duplicate dest "${dest}" (${label} and ${dests.get(dest)})`);
      } else {
        dests.set(dest, label);
      }
    }

    if (isNonEmptyString(sha) && !SHA_RE.test(sha)) {
      messages.push(`${label} sha must be 40-char lowercase hex`);
    }

    if (isNonEmptyString(url) && !isHttpsGitUrl(url)) {
      messages.push(`${label} url must be an https git URL`);
    }
  });

  return { ok: messages.length === 0, messages };
}

export function parseReferencesLockJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, messages: ["lockfile is not valid JSON"] };
  }
  return verifyReferencesLock(data);
}

const thisFile = fileURLToPath(import.meta.url);
const isMain =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).toLowerCase() === thisFile.toLowerCase();

if (isMain) {
  if (process.argv.includes("--simulate-mismatch")) {
    try {
      assertHeadMatchesLockSha(
        "example",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    }
    console.error("SHA mismatch check did not fail closed");
    process.exit(1);
  }

  const root = join(dirname(thisFile), "..");
  const lockPath = join(root, "references.lock.json");
  const result = parseReferencesLockJson(readFileSync(lockPath, "utf8"));
  if (!result.ok) {
    for (const message of result.messages) {
      console.error(`${lockPath}: ${message}`);
    }
    process.exit(1);
  }
}
