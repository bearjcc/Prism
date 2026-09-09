import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "vitest";
import {
  FIREFOX_ANDROID_MIN_VERSION,
  firefoxMobileContractViolations,
  type FirefoxManifest,
} from "./firefox-mobile-contract.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const chromeRoot = join(repoRoot, "apps", "extension", "targets", "chrome");
const firefoxRoot = join(repoRoot, "apps", "extension", "targets", "firefox");

type Manifest = FirefoxManifest & {
  background: {
    scripts?: string[];
    service_worker?: string;
    type: string;
  };
  content_scripts: Array<{
    js: string[];
    matches: string[];
    run_at: string;
  }>;
  action: {
    default_popup: string;
    default_icon: Record<string, string>;
  };
  options_ui: { page: string; open_in_tab: boolean };
  optional_host_permissions?: string[];
  web_accessible_resources?: Array<{
    resources: string[];
    matches: string[];
  }>;
};

function readManifest(root: string): Manifest {
  return JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as Manifest;
}

function listRelativeFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      files.push(path.slice(root.length + 1).replaceAll("\\", "/"));
    }
  };
  walk(root);
  return files;
}

test("generate writes the Firefox target from the Chrome pack", () => {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, "scripts", "generate-bundled-mods.mjs")],
    { cwd: repoRoot, encoding: "utf8" },
  );
  expect(result.status, result.stderr).toBe(0);

  expect(existsSync(join(firefoxRoot, "manifest.json"))).toBe(true);
  expect(existsSync(join(firefoxRoot, "bundled-mods.json"))).toBe(true);
  expect(existsSync(join(firefoxRoot, "dist", "content-script.js"))).toBe(true);
  expect(existsSync(join(firefoxRoot, "dist", "service-worker.js"))).toBe(true);
  expect(existsSync(join(firefoxRoot, "dist", "popup.js"))).toBe(true);
  expect(existsSync(join(firefoxRoot, "popup.html"))).toBe(true);
  expect(existsSync(join(firefoxRoot, "popup.css"))).toBe(true);
  expect(existsSync(join(firefoxRoot, "options.html"))).toBe(true);
  expect(existsSync(join(firefoxRoot, "options.css"))).toBe(true);
  expect(existsSync(join(firefoxRoot, "dist", "options.js"))).toBe(true);
  expect(existsSync(join(firefoxRoot, "icons", "icon16.png"))).toBe(true);

  expect(readFileSync(join(firefoxRoot, "popup.html"), "utf8")).toBe(
    readFileSync(join(chromeRoot, "popup.html"), "utf8"),
  );
  expect(readFileSync(join(firefoxRoot, "popup.css"), "utf8")).toBe(
    readFileSync(join(chromeRoot, "popup.css"), "utf8"),
  );
  expect(readFileSync(join(firefoxRoot, "options.html"), "utf8")).toBe(
    readFileSync(join(chromeRoot, "options.html"), "utf8"),
  );

  const chromeIndex = readFileSync(join(chromeRoot, "bundled-mods.json"), "utf8");
  const firefoxIndex = readFileSync(join(firefoxRoot, "bundled-mods.json"), "utf8");
  expect(firefoxIndex).toBe(chromeIndex);

  const firefoxFiles = listRelativeFiles(firefoxRoot);
  expect(firefoxFiles.some((path) => path.endsWith("gate.ts"))).toBe(false);
  expect(firefoxFiles.some((path) => path.includes("/src/gate."))).toBe(false);
});

test("Firefox manifest matches Chrome declarations with a Gecko background form", () => {
  const chrome = readManifest(chromeRoot);
  const firefox = readManifest(firefoxRoot);

  expect(firefox.manifest_version).toBe(3);
  expect(firefox.browser_specific_settings?.gecko).toBeUndefined();
  expect(firefox.browser_specific_settings?.gecko_android).toEqual({
    strict_min_version: FIREFOX_ANDROID_MIN_VERSION,
  });
  expect(JSON.stringify(firefox)).not.toMatch(/addons\.mozilla\.org/i);
  expect(firefoxMobileContractViolations(firefox)).toEqual([]);

  expect(firefox.permissions).toEqual(chrome.permissions);
  expect(firefox.host_permissions).toEqual(chrome.host_permissions);
  expect(firefox.optional_host_permissions).toEqual(
    chrome.optional_host_permissions,
  );
  expect(firefox.web_accessible_resources).toEqual(
    chrome.web_accessible_resources,
  );
  expect(firefox.action).toEqual(chrome.action);
  expect(firefox.options_ui).toEqual(chrome.options_ui);
  expect(firefox.content_scripts).toEqual(chrome.content_scripts);
  expect(firefox.content_scripts).toContainEqual({
    js: ["dist/content-script.js"],
    matches: ["<all_urls>"],
    run_at: "document_start",
  });

  expect(firefox.background.scripts).toEqual(["dist/service-worker.js"]);
  expect(firefox.background.type).toBe("module");
});
