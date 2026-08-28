import type { AdSlotHandle, PrismApi } from "@prism/schema";

const ASSETS = [
  "bundled-mods/prism.kitten-ad-replace/assets/kitten-1.svg",
  "bundled-mods/prism.kitten-ad-replace/assets/kitten-2.svg",
] as const;

export async function activate(prism: PrismApi): Promise<void> {
  const extracted = await prism.extract("visual.ad-slot.replace");
  if (!Array.isArray(extracted)) {
    return;
  }

  const slots = extracted.filter(isAdSlotHandle);
  slots.forEach((slot, index) => {
    prism.slots.replace(slot, {
      asset: ASSETS[index % ASSETS.length]!,
      alt: "A kitten replacing an advert",
    });
  });
}

function isAdSlotHandle(value: unknown): value is AdSlotHandle {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  );
}
