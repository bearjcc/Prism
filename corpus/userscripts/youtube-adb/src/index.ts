import type { AdSlotHandle, PrismApi } from "@prism/schema";

export async function activate(prism: PrismApi): Promise<void> {
  const extracted = await prism.extract("visual.ad-slot.replace");
  if (!Array.isArray(extracted)) {
    return;
  }
  for (const slot of extracted) {
    if (!isAdSlotHandle(slot)) {
      continue;
    }
    prism.slots.replace(slot, {
      kind: "message",
      message: "Advert slot hidden",
    });
  }
  prism.styles.apply(
    "ytd-ad-slot-renderer, ytd-display-ad-renderer { display: none !important; }",
  );
}

function isAdSlotHandle(value: unknown): value is AdSlotHandle {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  );
}
