import { describe, expect, test, vi } from "vitest";
import type { PrismManifest } from "@prism/schema";
import { createPrismApi } from "./prism-api.js";

const linkedinManifest: PrismManifest = {
  id: "prism.linkedin-home-first-degree",
  version: "1.0.0",
  runtime: "native",
  capabilities: {
    required: ["linkedin.home.allowlist"],
  },
  scopes: ["https://www.linkedin.com/*"],
};

const facebookManifest: PrismManifest = {
  id: "prism.facebook-home-friends",
  version: "1.0.0",
  runtime: "native",
  capabilities: {
    required: ["facebook.home.allowlist"],
  },
  scopes: ["https://www.facebook.com/*"],
};

describe("prism.ui.allowlist capability gate", () => {
  test("records handler when linkedin.home.allowlist is granted", () => {
    const allowlist = vi.fn();
    const prism = createPrismApi({
      manifest: linkedinManifest,
      grants: ["linkedin.home.allowlist"],
      tabId: 1,
      handlers: { allowlist },
    });

    prism.ui.allowlist("linkedin.home", "post");

    expect(allowlist).toHaveBeenCalledOnce();
    expect(allowlist).toHaveBeenCalledWith("linkedin.home", "post");
  });

  test("no-ops when linkedin.home.allowlist is not granted", () => {
    const allowlist = vi.fn();
    const prism = createPrismApi({
      manifest: linkedinManifest,
      grants: [],
      tabId: 1,
      handlers: { allowlist },
    });

    prism.ui.allowlist("linkedin.home", "post");

    expect(allowlist).not.toHaveBeenCalled();
  });

  test("records handler when facebook.home.allowlist is granted", () => {
    const allowlist = vi.fn();
    const prism = createPrismApi({
      manifest: facebookManifest,
      grants: ["facebook.home.allowlist"],
      tabId: 1,
      handlers: { allowlist },
    });

    prism.ui.allowlist("facebook.home", "post");

    expect(allowlist).toHaveBeenCalledOnce();
    expect(allowlist).toHaveBeenCalledWith("facebook.home", "post");
  });

  test("no-ops when facebook.home.allowlist is not granted", () => {
    const allowlist = vi.fn();
    const prism = createPrismApi({
      manifest: facebookManifest,
      grants: [],
      tabId: 1,
      handlers: { allowlist },
    });

    prism.ui.allowlist("facebook.home", "post");

    expect(allowlist).not.toHaveBeenCalled();
  });
});
