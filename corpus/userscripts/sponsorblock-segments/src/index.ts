import type { PrismApi } from "@prism/schema";

export async function activate(prism: PrismApi): Promise<void> {
  const watch = await prism.extract("youtube.watch.videoId");
  const segments = await prism.extract("youtube.watch.sponsorSegments", {
    watch,
  });
  void segments;
}
