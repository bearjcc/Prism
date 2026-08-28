import type { AdSlotHandle } from "@prism/schema";

const SLOT_ATTRIBUTE = "data-prism-ad-slot";

export function extractAdSlots(root: ParentNode): AdSlotHandle[] {
  const handles: AdSlotHandle[] = [];
  const seen = new Set<string>();

  for (const element of Array.from(
    root.querySelectorAll(`[${SLOT_ATTRIBUTE}]`),
  )) {
    const id = element.getAttribute(SLOT_ATTRIBUTE)?.trim();
    if (id === undefined || id === "" || seen.has(id)) {
      continue;
    }
    seen.add(id);
    handles.push({ id });
  }

  return handles;
}
