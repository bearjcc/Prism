import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { validateManifest } from "@prism/schema/validate";
import { checkModsEngine } from "./check-mods-engine.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoMods = join(repoRoot, "mods");

const TRACER_IDS = [
  "prism.kitten-ad-replace",
  "prism.youtube-home-videos",
  "prism.youtube-reddit-comments",
];

describe("checkModsEngine", () => {
  test("fails closed when mods has no prism.yaml", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-mods-empty-"));
    mkdirSync(join(dir, "ghost"));
    const result = checkModsEngine(dir, () => {
      throw new Error("validate must not run when the engine is empty");
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some((message) => /empty/i.test(message))).toBe(
      true,
    );
  });

  test("fails closed when prism.yaml is empty", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-mods-blank-"));
    const packageDir = join(dir, "blank");
    mkdirSync(packageDir);
    writeFileSync(join(packageDir, "prism.yaml"), "   \n", "utf8");
    const result = checkModsEngine(dir, () => {
      throw new Error("validate must not run on an empty manifest");
    });
    expect(result.ok).toBe(false);
    expect(result.messages.some((message) => /empty/i.test(message))).toBe(
      true,
    );
  });

  test("fails closed when a manifest does not validate", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-mods-invalid-"));
    const packageDir = join(dir, "invalid");
    mkdirSync(packageDir);
    writeFileSync(
      join(packageDir, "prism.yaml"),
      "id: not-a-valid-manifest\n",
      "utf8",
    );
    const result = checkModsEngine(dir, validateManifest);
    expect(result.ok).toBe(false);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  test("validates repo tracers via schema validate", () => {
    const result = checkModsEngine(repoMods, validateManifest);
    expect(result.ok).toBe(true);
    expect(result.messages).toEqual([]);
    expect(result.manifests.map((manifest) => manifest.id).sort()).toEqual(
      [...TRACER_IDS].sort(),
    );
  });
});
