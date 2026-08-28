import type { PrismApi } from "@prism/schema";

export function activate(prism: PrismApi): void {
  prism.ui.allowlist("youtube.home", "video");
}
