import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const IMPORT_RE = /from\s+["'](\.[^"']+)["']/g;

const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".jsx", ".css", ".json"];

function resolveImport(fromFile: string, spec: string): string | undefined {
  const base = join(dirname(fromFile), spec);
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
    const index = join(base, `index${ext}`);
    if (existsSync(index)) {
      return index;
    }
  }
  return undefined;
}

/** First-party files reachable from a page via relative imports. */
export function collectRouteSources(entry: string): string[] {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || seen.has(file)) {
      continue;
    }
    seen.add(file);
    if (!/\.(tsx?|jsx?)$/.test(file)) {
      continue;
    }
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(IMPORT_RE)) {
      const resolved = resolveImport(file, match[1]);
      if (resolved) {
        queue.push(resolved);
      }
    }
  }

  return [...seen].sort();
}

export function sourceByteLength(files: string[]): number {
  let total = 0;
  for (const file of files) {
    total += Buffer.byteLength(readFileSync(file), "utf8");
  }
  return total;
}
