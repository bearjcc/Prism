import type { AdSlotHandle } from "@prism/schema";

const SLOT_ATTRIBUTE = "data-prism-ad-slot";

const LIVE_AD_SLOT_SELECTORS: ReadonlyArray<{
  readonly selector: string;
  readonly kind: string;
}> = [
  { selector: "ytd-ad-slot-renderer", kind: "ytd-ad-slot-renderer" },
  { selector: "ytd-display-ad-renderer", kind: "ytd-display-ad-renderer" },
  {
    selector: "ytd-in-feed-ad-layout-renderer",
    kind: "ytd-in-feed-ad-layout-renderer",
  },
  {
    selector: "ytd-promoted-sparkles-web-renderer",
    kind: "ytd-promoted-sparkles-web-renderer",
  },
  {
    selector: "ytd-player-legacy-desktop-watch-ads-renderer",
    kind: "ytd-player-legacy-desktop-watch-ads-renderer",
  },
  {
    selector: "ytd-action-companion-ad-renderer",
    kind: "ytd-action-companion-ad-renderer",
  },
  { selector: "ytd-promoted-video-renderer", kind: "ytd-promoted-video-renderer" },
  { selector: ".ytp-ad-player-overlay", kind: "ytp-ad-player-overlay" },
  { selector: "ins.adsbygoogle", kind: "adsbygoogle" },
  { selector: "#masthead-ad", kind: "masthead-ad" },
];

export const LIVE_AD_SLOT_SELECTOR = LIVE_AD_SLOT_SELECTORS.map(
  ({ selector }) => selector,
).join(", ");

export function extractAdSlots(root: ParentNode): AdSlotHandle[] {
  const handles: AdSlotHandle[] = [];
  const seen = new Set<string>();

  for (const element of Array.from(
    root.querySelectorAll(`[${SLOT_ATTRIBUTE}]`),
  )) {
    if (isReplacedSlot(element)) {
      continue;
    }
    const id = element.getAttribute(SLOT_ATTRIBUTE)?.trim();
    if (id === undefined || id === "" || seen.has(id)) {
      continue;
    }
    seen.add(id);
    handles.push({ id });
  }

  const counts = new Map<string, number>();
  for (const { selector, kind } of LIVE_AD_SLOT_SELECTORS) {
    for (const element of Array.from(root.querySelectorAll(selector))) {
      if (
        isReplacedSlot(element) ||
        element.getAttribute(SLOT_ATTRIBUTE)?.trim()
      ) {
        continue;
      }
      const index = counts.get(kind) ?? 0;
      counts.set(kind, index + 1);
      const id = `live:${kind}:${index}`;
      if (seen.has(id)) {
        continue;
      }
      element.setAttribute(SLOT_ATTRIBUTE, id);
      seen.add(id);
      handles.push({ id });
    }
  }

  return handles;
}

function isReplacedSlot(element: Element): boolean {
  return element.querySelector("[data-prism-owned]") !== null;
}
