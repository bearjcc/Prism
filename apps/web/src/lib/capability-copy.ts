/** Human-readable capability summaries for marketplace disclosure. */
export const CAPABILITY_SUMMARIES: Readonly<Record<string, string>> = {
  "visual.ad-slot.replace":
    "Replace marked ad slots with mod-owned content. The mod never receives page HTML.",
  "network.browser.block":
    "Block listed third-party advert hosts via declarativeNetRequest. Off until granted.",
  "network.egress":
    "Brokered GET to declared URL contracts through the extension. Off until granted.",
  "youtube.home.allowlist":
    "Mount only video items from the YouTube Home extractor. Shorts, ads, and shelves stay out.",
  "linkedin.home.allowlist":
    "Filter the LinkedIn Home feed to first-degree connections and followed company or page posts.",
  "facebook.home.allowlist":
    "Filter the Facebook Home feed to original posts from Friends only.",
  "youtube.watch.videoId":
    "Read the watch video id from the page URL for cross-site extractors.",
  "reddit.comments.search":
    "Search Reddit for comments about this video. Requires Reddit host permission when granted.",
  "media.immich.contextUpload":
    "Upload images to your Immich server via the extension context menu or touch chip. Requires Immich host permission when configured.",
  "page.text.replace":
    "Replace configured words and phrases in visible page text. Matching runs in the content script; replacement is plain text only.",
  "site.ageGate.autoConfirm":
    "Skip age-entry gates via per-site rules and heuristics. Content script sets storage, clicks confirm, or hides overlays.",
  "site.subscribe.dismiss":
    "Dismiss newsletter and subscribe-to-read overlays using declared per-site rules and conservative heuristics. Clicks site dismiss controls or hides modal and backdrop from the content script. Not a paywall bypass.",
};

export function capabilitySummary(id: string): string {
  return CAPABILITY_SUMMARIES[id] ?? "Declared Prism capability.";
}
