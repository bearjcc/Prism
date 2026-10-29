import { describe, expect, it } from "vitest";
import {
  isForbiddenProductionCataloguePublicKey,
  marketplaceCatalogueSigningConfigured,
  resolveMarketplaceCataloguePublicKeyBase64,
  REVOKED_CATALOGUE_PUBLIC_KEYS_BASE64,
} from "./marketplace-catalogue.js";
import { MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64 } from "./catalogue-signing-test-keys.js";
import { MARKETPLACE_CATALOGUE_SIGNING_PUBLIC_KEY_BASE64 } from "./catalogue-signing-public-key.js";

describe("catalogue signing configuration", () => {
  it("rejects the revoked in-repo fixture public key", () => {
    for (const revoked of REVOKED_CATALOGUE_PUBLIC_KEYS_BASE64) {
      expect(isForbiddenProductionCataloguePublicKey(revoked)).toBe(true);
    }
  });

  it("rejects the test-only public key in production resolution", () => {
    expect(isForbiddenProductionCataloguePublicKey(MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64)).toBe(
      true,
    );
  });

  it("uses test public key only under vitest", () => {
    expect(resolveMarketplaceCataloguePublicKeyBase64()).toBe(
      MARKETPLACE_CATALOGUE_TEST_PUBLIC_KEY_BASE64,
    );
    expect(marketplaceCatalogueSigningConfigured()).toBe(true);
  });

  it("treats an empty committed public key as unconfigured outside tests", () => {
    expect(MARKETPLACE_CATALOGUE_SIGNING_PUBLIC_KEY_BASE64).toBe("");
    expect(isForbiddenProductionCataloguePublicKey("")).toBe(true);
  });
});
