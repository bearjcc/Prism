import { afterEach, describe, expect, test } from "vitest";
import {
  assertCatalogueSigningForBuild,
  catalogueSigningPublicKeyForVerify,
  isCiTestCatalogueSigningEnabled,
  MARKETPLACE_CATALOGUE_TEST_PRIVATE_KEY_BASE64,
  MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64,
} from "./catalogue-signing-config.mjs";

const originalGithubActions = process.env.GITHUB_ACTIONS;
const originalSigningKey = process.env.PRISM_CATALOGUE_SIGNING_KEY;
const originalVitest = process.env.VITEST;

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
});

describe("catalogue-signing-config CI fallback", () => {
  test("isCiTestCatalogueSigningEnabled is true only on GitHub Actions with the test private key", () => {
    delete process.env.GITHUB_ACTIONS;
    delete process.env.PRISM_CATALOGUE_SIGNING_KEY;
    expect(isCiTestCatalogueSigningEnabled()).toBe(false);

    process.env.GITHUB_ACTIONS = "true";
    process.env.PRISM_CATALOGUE_SIGNING_KEY =
      MARKETPLACE_CATALOGUE_TEST_PRIVATE_KEY_BASE64;
    expect(isCiTestCatalogueSigningEnabled()).toBe(true);
  });

  test("assertCatalogueSigningForBuild skips production checks for CI test signing", () => {
    delete process.env.VITEST;
    process.env.GITHUB_ACTIONS = "true";
    process.env.PRISM_CATALOGUE_SIGNING_KEY =
      MARKETPLACE_CATALOGUE_TEST_PRIVATE_KEY_BASE64;
    expect(() => {
      assertCatalogueSigningForBuild();
    }).not.toThrow();
  });

  test("catalogueSigningPublicKeyForVerify uses the test public key for CI test signing", () => {
    process.env.GITHUB_ACTIONS = "true";
    process.env.PRISM_CATALOGUE_SIGNING_KEY =
      MARKETPLACE_CATALOGUE_TEST_PRIVATE_KEY_BASE64;
    expect(catalogueSigningPublicKeyForVerify()).toBe(
      MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64,
    );
  });
});
