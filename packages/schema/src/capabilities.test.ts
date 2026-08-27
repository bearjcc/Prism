import { describe, expect, test } from "vitest";
import {
  CAPABILITY_IDS,
  CAPABILITY_REGISTRY,
} from "./capabilities.js";

describe("capability registry", () => {
  test("contains exactly the seven v1 capability ids", () => {
    expect(CAPABILITY_IDS).toEqual([
      "visual.ad-slot.replace",
      "visual.hide",
      "network.browser.block",
      "network.egress",
      "youtube.home.allowlist",
      "youtube.watch.videoId",
      "reddit.comments.search",
    ]);
  });

  test("defines JSON result schemas for extractor capabilities", () => {
    expect(CAPABILITY_REGISTRY["youtube.home.allowlist"].resultSchema).toBeDefined();
    expect(CAPABILITY_REGISTRY["youtube.watch.videoId"].resultSchema).toBeDefined();
    expect(CAPABILITY_REGISTRY["reddit.comments.search"].resultSchema).toBeDefined();
  });
});
