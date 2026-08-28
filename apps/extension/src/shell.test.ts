import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, expect, test } from "vitest";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const chromeRoot = join(repoRoot, "apps", "extension", "targets", "chrome");
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Chrome manifest declares an MV3 document_start shell", () => {
  const manifestPath = join(chromeRoot, "manifest.json");
  expect(existsSync(manifestPath)).toBe(true);
  if (!existsSync(manifestPath)) {
    return;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    manifest_version: number;
    background: { service_worker: string; type: string };
    content_scripts: Array<{
      js: string[];
      matches: string[];
      run_at: string;
    }>;
    action: { default_popup: string };
    host_permissions?: string[];
    optional_host_permissions?: string[];
    web_accessible_resources?: Array<{
      resources: string[];
      matches: string[];
    }>;
  };

  expect(manifest.manifest_version).toBe(3);
  expect(manifest.background).toEqual({
    service_worker: "dist/service-worker.js",
    type: "module",
  });
  expect(manifest.content_scripts).toContainEqual({
    js: ["dist/content-script.js"],
    matches: ["<all_urls>"],
    run_at: "document_start",
  });
  expect(manifest.action.default_popup).toBe("popup.html");
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.optional_host_permissions).toEqual(["<all_urls>"]);
  expect(manifest.web_accessible_resources).toContainEqual({
    resources: ["bundled-mods/*"],
    matches: ["<all_urls>"],
  });
});

test("popup ships controls for mods, optional grants, and undo", () => {
  const popupPath = join(chromeRoot, "popup.html");
  expect(existsSync(popupPath)).toBe(true);
  if (!existsSync(popupPath)) {
    return;
  }

  const popup = readFileSync(popupPath, "utf8");
  expect(popup).toContain('id="mods"');
  expect(popup).toContain('id="undo"');
  expect(popup).toContain('src="dist/popup.js"');
});

test("bundled mod generation skips directories without prism.yaml", () => {
  const root = mkdtempSync(join(tmpdir(), "prism-bundled-mods-"));
  temporaryDirectories.push(root);
  const modsRoot = join(root, "mods");
  const outputRoot = join(root, "chrome");
  mkdirSync(join(modsRoot, "legacy-stub"), { recursive: true });
  writeFileSync(join(modsRoot, "legacy-stub", "mod.json"), "{}");
  mkdirSync(join(modsRoot, "fixture-empty"), { recursive: true });
  writeFileSync(
    join(modsRoot, "fixture-empty", "prism.yaml"),
    [
      "id: fixture.empty",
      "version: 1.0.0",
      "runtime: native",
      "capabilities:",
      "  required: []",
      "scopes:",
      "  - https://example.com/*",
      "",
    ].join("\n"),
  );

  const result = spawnSync(
    process.execPath,
    [
      join(repoRoot, "scripts", "generate-bundled-mods.mjs"),
      modsRoot,
      outputRoot,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );

  expect(result.status, result.stderr).toBe(0);
  const indexPath = join(outputRoot, "bundled-mods.json");
  expect(existsSync(indexPath)).toBe(true);
  if (!existsSync(indexPath)) {
    return;
  }
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as Array<{
    manifest: { id: string };
    entry: string | null;
  }>;
  expect(index).toEqual([
    {
      manifest: expect.objectContaining({ id: "fixture.empty" }),
      entry: null,
    },
  ]);
  const serviceWorker = readFileSync(
    join(outputRoot, "dist", "service-worker.js"),
    "utf8",
  );
  expect(serviceWorker).not.toContain("@prism/schema");
});

test("root build generates the Chrome bundled mod index", () => {
  const packagePath = join(repoRoot, "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    scripts: { build: string; postbuild: string };
  };

  expect(pkg.scripts.postbuild).toContain("generate-bundled-mods.mjs");
  expect(dirname(join(chromeRoot, "bundled-mods.json"))).toBe(chromeRoot);
});
