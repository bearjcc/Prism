import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  FIREFOX_ANDROID_MIN_VERSION,
  firefoxMobileContractViolations,
  type FirefoxManifest,
} from "./firefox-mobile-contract.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const firefoxManifestPath = join(
  repoRoot,
  "apps",
  "extension",
  "targets",
  "firefox",
  "manifest.json",
);

function readFirefoxManifest(): FirefoxManifest {
  return JSON.parse(readFileSync(firefoxManifestPath, "utf8")) as FirefoxManifest;
}

test("Firefox unpack manifest satisfies Firefox for Android safety contracts", () => {
  const violations = firefoxMobileContractViolations(readFirefoxManifest());
  expect(violations).toEqual([]);
});

test("firefoxMobileContractViolations rejects missing gecko_android", () => {
  const violations = firefoxMobileContractViolations({
    manifest_version: 3,
    background: { scripts: ["dist/service-worker.js"], type: "module" },
  });
  expect(violations).toContain(
    "browser_specific_settings.gecko_android is required for Firefox for Android",
  );
});

test("firefoxMobileContractViolations rejects background service workers", () => {
  const violations = firefoxMobileContractViolations({
    manifest_version: 3,
    browser_specific_settings: {
      gecko_android: { strict_min_version: FIREFOX_ANDROID_MIN_VERSION },
    },
    background: {
      service_worker: "dist/service-worker.js",
      type: "module",
    },
  });
  expect(violations).toContain(
    "background.service_worker is unsupported on Firefox for Android; use background.scripts",
  );
});

test("firefoxMobileContractViolations rejects desktop gecko metadata", () => {
  const violations = firefoxMobileContractViolations({
    manifest_version: 3,
    browser_specific_settings: {
      gecko: { id: "prism@example" },
      gecko_android: { strict_min_version: FIREFOX_ANDROID_MIN_VERSION },
    },
    background: { scripts: ["dist/service-worker.js"], type: "module" },
  });
  expect(violations).toContain(
    "browser_specific_settings.gecko must not be set on the unpack Firefox target",
  );
});
