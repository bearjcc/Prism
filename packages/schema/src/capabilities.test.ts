import { describe, expect, test } from "vitest";
import {
  CAPABILITY_IDS,
  CAPABILITY_REGISTRY,
} from "./capabilities.js";

describe("capability registry", () => {
  test("contains the v1 tracers plus corpus extractor ids", () => {
    expect(CAPABILITY_IDS).toEqual([
      "visual.ad-slot.replace",
      "visual.hide",
      "network.browser.block",
      "network.egress",
      "youtube.home.allowlist",
      "youtube.watch.videoId",
      "reddit.comments.search",
      "youtube.watch.dismissIdle",
      "youtube.watch.sponsorSegments",
      "search.results.directLinks",
      "reddit.feed.posts",
      "youtube.watch.constrainAutoplay",
      "youtube.watch.constrainEndScreens",
      "youtube.watch.constrainMiniplayer",
    ]);
  });

  test("defines JSON result schemas for extractor capabilities", () => {
    expect(CAPABILITY_REGISTRY["youtube.home.allowlist"].resultSchema).toBeDefined();
    expect(CAPABILITY_REGISTRY["youtube.watch.videoId"].resultSchema).toBeDefined();
    expect(CAPABILITY_REGISTRY["reddit.comments.search"].resultSchema).toBeDefined();
    expect(
      CAPABILITY_REGISTRY["youtube.watch.dismissIdle"].resultSchema,
    ).toMatchObject({
      required: ["dismissed"],
    });
    expect(
      CAPABILITY_REGISTRY["youtube.watch.sponsorSegments"].resultSchema,
    ).toMatchObject({
      required: ["segments"],
    });
    expect(
      CAPABILITY_REGISTRY["search.results.directLinks"].resultSchema,
    ).toMatchObject({
      required: ["links"],
    });
    expect(
      CAPABILITY_REGISTRY["reddit.feed.posts"].resultSchema,
    ).toMatchObject({
      required: ["posts"],
    });
    expect(
      CAPABILITY_REGISTRY["youtube.watch.constrainAutoplay"].resultSchema,
    ).toMatchObject({
      required: ["constrained"],
    });
    expect(
      CAPABILITY_REGISTRY["youtube.watch.constrainEndScreens"].resultSchema,
    ).toMatchObject({
      required: ["constrained"],
    });
    expect(
      CAPABILITY_REGISTRY["youtube.watch.constrainMiniplayer"].resultSchema,
    ).toMatchObject({
      required: ["constrained"],
    });
  });
});
