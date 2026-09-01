import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  findNonAscii,
  findUsSpellings,
  scanText,
} from "./check-text.mjs";

describe("findNonAscii", () => {
  test("reports the first non-ASCII byte", () => {
    const hits = findNonAscii("ok \u2014 dash");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]).toMatch(/non-ASCII/);
  });

  test("accepts ASCII", () => {
    expect(findNonAscii("licence colour behaviour\n")).toEqual([]);
  });
});

describe("findUsSpellings", () => {
  const words = ["behavior", "organize", "favorite"];

  test("flags a US spelling as a whole word", () => {
    const hits = findUsSpellings("This behavior is wrong.", words);
    expect(hits.some((h) => h.includes("behavior"))).toBe(true);
  });

  test("does not flag GB spelling", () => {
    expect(findUsSpellings("This behaviour is fine.", words)).toEqual([]);
  });
});

describe("scanText", () => {
  test("fails closed on a file with a US spelling", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-check-text-"));
    const file = join(dir, "note.md");
    writeFileSync(file, "Please organize the mods.\n", "utf8");
    const result = scanText(file, "Please organize the mods.\n", ["organize"]);
    expect(result.ok).toBe(false);
    expect(result.messages.some((m) => m.includes("organize"))).toBe(true);
  });
});
