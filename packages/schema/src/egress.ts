import type { EgressContract } from "./manifest.js";

export function egressContractHostPatterns(
  contracts: readonly EgressContract[],
): string[] {
  const patterns = new Set<string>();
  for (const contract of contracts) {
    const pattern = hostPatternFromContractUrl(contract.url);
    if (pattern !== undefined) {
      patterns.add(pattern);
    }
  }
  return [...patterns];
}

export function hostPatternFromContractUrl(contractUrl: string): string | undefined {
  const trimmed = contractUrl.trim();
  if (trimmed === "") {
    return undefined;
  }
  const wildcardIndex = trimmed.indexOf("*");
  const prefix =
    wildcardIndex >= 0 ? trimmed.slice(0, wildcardIndex) : trimmed;
  try {
    const parsed = new URL(prefix.endsWith("/") ? prefix : `${prefix}/`);
    return `${parsed.origin}/*`;
  } catch {
    return undefined;
  }
}

export function urlMatchesEgressContract(
  url: string,
  contract: EgressContract,
): boolean {
  const trimmed = contract.url.trim();
  if (trimmed === "") {
    return false;
  }
  if (!trimmed.endsWith("*")) {
    return url === trimmed;
  }
  const prefix = trimmed.slice(0, -1);
  try {
    const candidate = new URL(url);
    const pattern = new URL(prefix.endsWith("/") ? prefix : `${prefix}/`);
    if (candidate.origin !== pattern.origin) {
      return false;
    }
    return candidate.href.startsWith(prefix);
  } catch {
    return false;
  }
}

export function defaultEgressRequestUrl(contract: EgressContract): string | undefined {
  const trimmed = contract.url.trim();
  if (trimmed === "") {
    return undefined;
  }
  if (!trimmed.endsWith("*")) {
    return trimmed;
  }
  return trimmed.slice(0, -1);
}
