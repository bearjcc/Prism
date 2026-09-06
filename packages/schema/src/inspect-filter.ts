export type FilterFindingKind = "filter";

export interface FilterFinding {
  readonly kind: FilterFindingKind;
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

const HOST_FILTER = /^\|\|([a-z0-9.-]+)\^$/iu;

export function inspectBrowserFilterText(
  file: string,
  source: string,
): FilterFinding[] {
  const findings: FilterFinding[] = [];
  for (const [index, sourceLine] of source.split(/\r?\n/u).entries()) {
    const line = sourceLine.trim();
    if (line === "" || line.startsWith("!")) {
      continue;
    }
    const match = HOST_FILTER.exec(line);
    if (match !== null && isSafeHost(match[1] ?? "")) {
      continue;
    }
    if (isSafeCosmeticFilter(line)) {
      continue;
    }
    if (match === null || !isSafeHost(match[1] ?? "")) {
      findings.push({
        kind: "filter",
        file,
        line: index + 1,
        message: "browser filter must be a host block in the form ||host^",
      });
    }
  }
  return findings;
}

function isSafeCosmeticFilter(line: string): boolean {
  const separator = line.indexOf("##");
  if (separator < 0 || line.includes("#@#")) {
    return false;
  }
  const domains = line.slice(0, separator).trim();
  const selector = line.slice(separator + 2).trim();
  return (
    (domains === "" ||
      domains
        .split(",")
        .every((domain) => isSafeHost(domain.replace(/^\./u, "")))) &&
    selector !== "" &&
    !/[{}@]/u.test(selector) &&
    !/url\s*\(/iu.test(selector)
  );
}

function isSafeHost(host: string): boolean {
  return (
    host.length > 0 &&
    host.length <= 253 &&
    !host.startsWith(".") &&
    !host.endsWith(".") &&
    !host.includes("..") &&
    host.split(".").every((label) => label.length > 0 && label.length <= 63)
  );
}
