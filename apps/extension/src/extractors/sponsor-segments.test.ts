import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { JSDOM } from "jsdom";
import {
  applySponsorSegmentSkips,
  createSponsorSkipSegmentsUrl,
  findWatchVideo,
  parseSponsorSegments,
  searchSponsorSegments,
} from "./sponsor-segments.js";

const fixture = readFileSync(
  join(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "..",
    "corpus",
    "userscripts",
    "sponsorblock-segments",
    "fixtures",
    "skip-segments.json",
  ),
  "utf8",
);

describe("SponsorBlock segments extractor", () => {
  test("parses skip segments from saved API JSON and never copies HTML", () => {
    expect(parseSponsorSegments(fixture)).toEqual({
      segments: [
        {
          category: "sponsor",
          actionType: "skip",
          start: 1.5,
          end: 12,
        },
        {
          category: "intro",
          actionType: "skip",
          start: 12,
          end: 18.25,
        },
      ],
    });
    expect(JSON.stringify(parseSponsorSegments(fixture))).not.toMatch(/</u);
  });

  test("fetches a documented skipSegments URL without live network", async () => {
    const fetchJson = vi.fn().mockResolvedValue(fixture);

    await expect(
      searchSponsorSegments({ watch: { videoId: "fixture-video-id" } }, fetchJson),
    ).resolves.toEqual({
      segments: expect.arrayContaining([
        expect.objectContaining({ category: "sponsor", start: 1.5 }),
      ]),
    });
    expect(fetchJson).toHaveBeenCalledWith(
      "https://sponsor.ajay.app/api/skipSegments?videoID=fixture-video-id",
    );
    expect(createSponsorSkipSegmentsUrl("fixture-video-id")).toBe(
      "https://sponsor.ajay.app/api/skipSegments?videoID=fixture-video-id",
    );
  });

  test("rejects a missing video id before requesting SponsorBlock", async () => {
    const fetchJson = vi.fn();

    await expect(searchSponsorSegments({}, fetchJson)).rejects.toThrow("video id");
    expect(fetchJson).not.toHaveBeenCalled();
  });

  test("returns an empty list when the API has no segments", () => {
    expect(parseSponsorSegments("[]")).toEqual({ segments: [] });
  });

  test("seeks the watch video across skip segments without exposing HTML", () => {
    const document = new JSDOM(`
      <video class="html5-main-video"></video>
    `).window.document;
    const video = findWatchVideo(document);
    expect(video).toBeInstanceOf(document.defaultView!.HTMLVideoElement);
    const segments = parseSponsorSegments(fixture).segments;

    applySponsorSegmentSkips(video!, segments);
    video!.currentTime = 2;
    video!.dispatchEvent(new document.defaultView!.Event("timeupdate"));

    expect(video!.currentTime).toBe(12);
    expect(JSON.stringify(segments)).not.toMatch(/</u);
  });
});

