export interface SponsorSegment {
  readonly category: string;
  readonly actionType: string;
  readonly start: number;
  readonly end: number;
}

export interface SponsorSegmentsExtraction {
  readonly segments: readonly SponsorSegment[];
}

export type FetchSponsorJson = (url: string) => Promise<string>;

const SPONSOR_SKIP_SEGMENTS_ORIGIN = "https://sponsor.ajay.app";

export function createSponsorSkipSegmentsUrl(videoId: string): string {
  const url = new URL("/api/skipSegments", SPONSOR_SKIP_SEGMENTS_ORIGIN);
  url.searchParams.set("videoID", videoId);
  return url.href;
}

export function parseSponsorSegments(jsonText: string): SponsorSegmentsExtraction {
  const parsed: unknown = JSON.parse(jsonText);
  if (!Array.isArray(parsed)) {
    throw new Error("SponsorBlock skipSegments payload is invalid");
  }

  const segments: SponsorSegment[] = [];
  for (const entry of parsed) {
    const segment = readSkipSegment(entry);
    if (segment !== undefined) {
      segments.push(segment);
    }
  }
  return { segments };
}

export async function searchSponsorSegments(
  input: Readonly<Record<string, unknown>> | undefined,
  fetchJson: FetchSponsorJson,
): Promise<SponsorSegmentsExtraction> {
  const videoId = readSponsorSegmentsVideoId(input);
  return parseSponsorSegments(await fetchJson(createSponsorSkipSegmentsUrl(videoId)));
}

export function readSponsorSegmentsVideoId(
  input: Readonly<Record<string, unknown>> | undefined,
): string {
  const direct = input?.videoId;
  if (typeof direct === "string" && direct.trim() !== "") {
    return direct.trim();
  }
  const watch = input?.watch;
  if (isRecord(watch) && typeof watch.videoId === "string" && watch.videoId.trim() !== "") {
    return watch.videoId.trim();
  }
  throw new Error("YouTube watch video id is required");
}

function readSkipSegment(value: unknown): SponsorSegment | undefined {
  if (!isRecord(value) || value.actionType !== "skip") {
    return undefined;
  }
  if (typeof value.category !== "string" || value.category.trim() === "") {
    return undefined;
  }
  if (!Array.isArray(value.segment) || value.segment.length < 2) {
    return undefined;
  }
  const start = value.segment[0];
  const end = value.segment[1];
  if (typeof start !== "number" || typeof end !== "number" || end < start) {
    return undefined;
  }
  return {
    category: value.category.trim(),
    actionType: "skip",
    start,
    end,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const WATCH_VIDEO_SELECTOR =
  "video.html5-main-video, video.video-stream, video";
const skipListeners = new WeakMap<HTMLMediaElement, EventListener>();

export function findWatchVideo(root: ParentNode): HTMLMediaElement | undefined {
  const element = root.querySelector(WATCH_VIDEO_SELECTOR);
  if (element === null || !isMediaElement(element)) {
    return undefined;
  }
  return element;
}

export function applySponsorSegmentSkips(
  video: HTMLMediaElement,
  segments: readonly SponsorSegment[],
): void {
  const previous = skipListeners.get(video);
  if (previous !== undefined) {
    video.removeEventListener("timeupdate", previous);
  }
  const skipIfInsideSegment = (): void => {
    const time = video.currentTime;
    for (const segment of segments) {
      if (time >= segment.start && time < segment.end) {
        video.currentTime = segment.end;
        return;
      }
    }
  };
  const onTimeUpdate: EventListener = () => {
    skipIfInsideSegment();
  };
  skipListeners.set(video, onTimeUpdate);
  video.addEventListener("timeupdate", onTimeUpdate);
  skipIfInsideSegment();
}

function isMediaElement(value: Element): value is HTMLMediaElement {
  return "currentTime" in value && typeof value.addEventListener === "function";
}
