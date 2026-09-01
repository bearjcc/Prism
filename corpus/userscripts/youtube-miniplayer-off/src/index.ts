import type { PrismApi } from "@prism/schema";

export async function activate(prism: PrismApi): Promise<void> {
  await prism.extract("youtube.watch.constrainMiniplayer");
}
