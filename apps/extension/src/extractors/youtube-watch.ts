export interface YoutubeWatchExtraction {
  readonly videoId: string;
}

export function extractYoutubeWatch(
  pageUrl: string,
  root?: ParentNode,
): YoutubeWatchExtraction {
  const url = new URL(pageUrl);
  const urlVideoId =
    url.hostname === "www.youtube.com" && url.pathname === "/watch"
      ? url.searchParams.get("v")?.trim()
      : undefined;
  const fixtureVideoId = root
    ?.querySelector("[video-id]")
    ?.getAttribute("video-id")
    ?.trim();
  const videoId = urlVideoId || fixtureVideoId;

  if (videoId === undefined || videoId === "") {
    throw new Error("YouTube watch video id is not available");
  }
  return { videoId };
}
