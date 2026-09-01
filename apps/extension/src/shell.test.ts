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
    permissions: string[];
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
  expect(manifest.permissions).toContain("declarativeNetRequest");
  expect(manifest.permissions).toContain("contextMenus");
  expect(manifest.permissions).toContain("webNavigation");
  expect(manifest.permissions).toContain("userScripts");
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.optional_host_permissions).toEqual([
    "https://www.reddit.com/*",
    "https://sponsor.ajay.app/*",
    "<all_urls>",
  ]);
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
  expect(popup).toContain('id="page-activity"');
  expect(popup).toContain('id="activity"');
  expect(popup).toContain('id="undo"');
    expect(popup).toContain('id="page-origin"');
  expect(popup).toContain('id="find-mods"');
  expect(popup).toContain('id="pin-hint"');
  expect(popup).toContain("Mods for this site");
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
    scripts: { build: string };
  };

  expect(pkg.scripts.build).toContain("generate-bundled-mods.mjs");
  expect(pkg.scripts.build).toMatch(/tsc -b.*generate-bundled-mods/);
  expect(dirname(join(chromeRoot, "bundled-mods.json"))).toBe(chromeRoot);
});

test("generate-bundled-mods packs mods/ by default, not corpus/", () => {
  const generatePath = join(repoRoot, "scripts", "generate-bundled-mods.mjs");
  const generateSource = readFileSync(generatePath, "utf8");
  const packagePath = join(repoRoot, "package.json");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
    scripts: { build: string };
  };

  expect(generateSource).toContain(
    'process.argv[2] ?? join(repoRoot, "mods")',
  );
  expect(generateSource).not.toMatch(/corpus/u);
  expect(pkg.scripts.build).toMatch(
    /node scripts\/generate-bundled-mods\.mjs(?:\s|$)/u,
  );
  expect(pkg.scripts.build).not.toMatch(/generate-bundled-mods\.mjs\s+.*corpus/u);

  if (existsSync(join(chromeRoot, "bundled-mods.json"))) {
    const bundled = JSON.parse(
      readFileSync(join(chromeRoot, "bundled-mods.json"), "utf8"),
    ) as Array<{ manifest: { id: string } }>;
    expect(bundled.map((entry) => entry.manifest.id)).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^prism\.corpus\./u),
      ]),
    );
  }
});
