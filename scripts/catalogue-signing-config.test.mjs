import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import {
  assertTrustedCataloguePublicKeyBase64,
  catalogueSigningPublicKeyForVerify,
  isProductionCatalogueSigningConfigured,
  MARKETPLACE_CATALOGUE_TEST_PRIVATE_KEY_BASE64,
  MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64,
} from "./catalogue-signing-config.mjs";
import { MARKETPLACE_CATALOGUE_TEST_PRIVATE_KEY_BASE64 as TEST_PRIVATE_FROM_MODULE } from "./marketplace-catalogue-test-keys.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const originalGithubActions = process.env.GITHUB_ACTIONS;
const originalSigningKey = process.env.PRISM_CATALOGUE_SIGNING_KEY;
const originalVitest = process.env.VITEST;
const originalRequire = process.env.PRISM_REQUIRE_CATALOGUE_SIGNING;

afterEach(() => {
  if (originalGithubActions === undefined) {
    delete process.env.GITHUB_ACTIONS;
  } else {
    process.env.GITHUB_ACTIONS = originalGithubActions;
  }
  if (originalSigningKey === undefined) {
    delete process.env.PRISM_CATALOGUE_SIGNING_KEY;
  } else {
    process.env.PRISM_CATALOGUE_SIGNING_KEY = originalSigningKey;
  }
  if (originalVitest === undefined) {
    delete process.env.VITEST;
  } else {
    process.env.VITEST = originalVitest;
  }
  if (originalRequire === undefined) {
    delete process.env.PRISM_REQUIRE_CATALOGUE_SIGNING;
  } else {
    process.env.PRISM_REQUIRE_CATALOGUE_SIGNING = originalRequire;
  }
});

describe("catalogue-signing-config production guards", () => {
  test("test private key env is rejected outside unit tests", () => {
    delete process.env.VITEST;
    process.env.PRISM_CATALOGUE_SIGNING_KEY =
      MARKETPLACE_CATALOGUE_TEST_PRIVATE_KEY_BASE64;
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        "import { resolveCatalogueSigningPrivateKeyBase64 } from './scripts/catalogue-signing-config.mjs'; resolveCatalogueSigningPrivateKeyBase64();",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/test-only PRISM_CATALOGUE_SIGNING_KEY/iu);
  });

  test("catalogueSigningPublicKeyForVerify never trusts the test public key outside vitest", () => {
    delete process.env.VITEST;
    delete process.env.PRISM_CATALOGUE_SIGNING_KEY;
    process.env.GITHUB_ACTIONS = "true";
    process.env.PRISM_CATALOGUE_SIGNING_KEY = TEST_PRIVATE_FROM_MODULE;
    expect(isProductionCatalogueSigningConfigured()).toBe(false);
    expect(catalogueSigningPublicKeyForVerify()).not.toBe(
      MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64,
    );
    expect(() => {
      assertTrustedCataloguePublicKeyBase64(
        MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64,
      );
    }).toThrow(/must not be used as a trusted verification key/iu);
  });

  test("catalogueSigningPublicKeyForVerify uses the test public key only under vitest", () => {
    process.env.VITEST = "true";
    expect(catalogueSigningPublicKeyForVerify()).toBe(
      MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64,
    );
  });
});
