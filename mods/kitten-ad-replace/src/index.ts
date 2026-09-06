import type { AdSlotHandle, PrismApi } from "@prism/schema";

const REMOTE_CONTRACT = "remote-kitten-images";

const ASSETS = [
  "assets/kitten-1.svg",
  "assets/kitten-2.svg",
  "assets/kitten-3.svg",
  "assets/kitten-4.svg",
  "assets/kitten-5.svg",
  "assets/kitten-6.svg",
  "assets/kitten-7.svg",
  "assets/kitten-8.svg",
  "assets/kitten-9.svg",
  "assets/kitten-10.svg",
] as const;

export async function activate(prism: PrismApi): Promise<void> {
  const extracted = await prism.extract("visual.ad-slot.replace");
  if (!Array.isArray(extracted)) {
    return;
  }

  const slots = extracted.filter(isAdSlotHandle);
  const remoteUrl = await readRemoteKittenUrl(prism);

  slots.forEach((slot, index) => {
    if (remoteUrl !== undefined) {
      prism.slots.replace(slot, {
        kind: "remote-image",
        contractId: REMOTE_CONTRACT,
        url: remoteUrl,
        alt: "A kitten replacing an advert",
      });
      return;
    }
    prism.slots.replace(slot, {
      asset: ASSETS[index % ASSETS.length]!,
      alt: "A kitten replacing an advert",
    });
  });
}

async function readRemoteKittenUrl(prism: PrismApi): Promise<string | undefined> {
  const response = await prism.net.request(REMOTE_CONTRACT);
  if (response.status !== 200) {
    return undefined;
  }
  const url = response.fields.url;
  return typeof url === "string" && url.trim() !== "" ? url.trim() : undefined;
}

function isAdSlotHandle(value: unknown): value is AdSlotHandle {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string"
  );
}
