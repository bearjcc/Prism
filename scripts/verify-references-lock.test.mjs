import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  assertHeadMatchesLockSha,
  parseReferencesLockJson,
  restoreScriptsCompareHeadToSha,
  verifyReferencesLock,
} from "./verify-references-lock.mjs";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, "..");

function goodEntry(overrides = {}) {
  return {
    id: "stylus",
    url: "https://github.com/openstyles/stylus.git",
    ref: "refs/tags/v2.4.11",
    sha: "76805e7555cc2d80133a7fb07f55812d5811b6b0",
    dest: "stylus",
    ...overrides,
  };
}

function goodLock(references) {
  return { version: 1, references };
}

describe("verifyReferencesLock", () => {
  test("good lockfile passes", () => {
    const result = verifyReferencesLock(
      goodLock([
        goodEntry(),
        goodEntry({
          id: "easylist",
          dest: "easylist",
          url: "https://github.com/easylist/easylist.git",
          sha: "827602abf78e4f2e9797198e0afcecca5a6cc356",
        }),
      ]),
    );
    expect(result).toEqual({ ok: true, messages: [] });
  });

  test("repo lockfile passes", () => {
    const text = readFileSync(join(repoRoot, "references.lock.json"), "utf8");
    expect(parseReferencesLockJson(text).ok).toBe(true);
  });

  test("missing sha fails", () => {
    const entry = goodEntry();
    delete entry.sha;
    const result = verifyReferencesLock(goodLock([entry]));
    expect(result.ok).toBe(false);
    expect(result.messages.some((m) => m.includes("missing sha"))).toBe(true);
  });

  test("duplicate dest fails", () => {
    const result = verifyReferencesLock(
      goodLock([
        goodEntry(),
        goodEntry({ id: "other", dest: "stylus" }),
      ]),
    );
    expect(result.ok).toBe(false);
    expect(result.messages.some((m) => m.includes("duplicate dest"))).toBe(true);
  });

  test("bad sha length fails", () => {
    const result = verifyReferencesLock(
      goodLock([goodEntry({ sha: "76805e7555cc2d80133a7fb07f55812d5811b6b" })]),
    );
    expect(result.ok).toBe(false);
    expect(result.messages.some((m) => m.includes("40-char lowercase hex"))).toBe(
      true,
    );
  });
});

describe("restore SHA fail-closed", () => {
  test("assertHeadMatchesLockSha throws on mismatch", () => {
    expect(() =>
      assertHeadMatchesLockSha(
        "stylus",
        "76805e7555cc2d80133a7fb07f55812d5811b6b0",
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
    ).toThrow(/SHA mismatch for stylus/);
  });

  test("restore scripts compare HEAD to lock SHA", () => {
    const sh = readFileSync(join(scriptsDir, "restore-references.sh"), "utf8");
    const ps1 = readFileSync(join(scriptsDir, "restore-references.ps1"), "utf8");
    expect(restoreScriptsCompareHeadToSha(sh, ps1).ok).toBe(true);
  });

  test("--simulate-mismatch exits non-zero without cloning", () => {
    const result = spawnSync(
      process.execPath,
      [join(scriptsDir, "verify-references-lock.mjs"), "--simulate-mismatch"],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/SHA mismatch/);
  });
});
