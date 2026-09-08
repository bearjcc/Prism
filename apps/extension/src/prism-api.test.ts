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
  scopes: ["https://www.linkedin.com/"],
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
});
