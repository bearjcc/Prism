import type { PageTextReplaceRules, PrismApi } from "@prism/schema";

export async function activate(prism: PrismApi): Promise<void> {
  const rules = await prism.extract("page.text.replace");
  if (!isRules(rules)) {
    return;
  }
  prism.text.replace(rules);
}

function isRules(value: unknown): value is PageTextReplaceRules {
  return (
    typeof value === "object" &&
    value !== null &&
    "pairs" in value &&
    Array.isArray(value.pairs)
  );
}
