import type { PrismApi } from "@prism/schema";

export async function activate(prism: PrismApi): Promise<void> {
  await Promise.resolve(prism.ui.allowlist("facebook.home", "post"));
}
