import type { PrismApi } from "@prism/schema";

export async function activate(prism: PrismApi): Promise<void> {
  const results = await prism.extract("search.results.directLinks");
  void results;
}
