import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const PAGE_NAMES = new Set(["page.tsx", "page.ts", "page.jsx", "page.js"]);
const SKIP_DIRS = new Set(["fonts"]);

export type AppRouteFile = {
  rel: string;
  abs: string;
};

function posixRel(appDir: string, abs: string): string {
  return relative(appDir, abs).split("\\").join("/");
}

export function listAppRouteFiles(appDir: string): AppRouteFile[] {
  const out: AppRouteFile[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          continue;
        }
        walk(abs);
        continue;
      }
      if (PAGE_NAMES.has(entry.name) || entry.name === "not-found.tsx" || entry.name === "not-found.ts") {
        out.push({ rel: posixRel(appDir, abs), abs });
      }
    }
  }

  walk(appDir);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

export function isHomeRoute(rel: string): boolean {
  return rel === "page.tsx" || rel === "page.ts" || rel === "page.jsx" || rel === "page.js";
}

export function listInnerRouteFiles(appDir: string): AppRouteFile[] {
  return listAppRouteFiles(appDir).filter((file) => !isHomeRoute(file.rel));
}

export function sourceUsesSiteShell(source: string): boolean {
  return /from\s+["'][^"']*site-shell["']/.test(source) && /\bSiteShell\b/.test(source);
}

function layoutPath(dir: string): string | undefined {
  for (const name of ["layout.tsx", "layout.ts", "layout.jsx", "layout.js"]) {
    const abs = join(dir, name);
    if (existsSync(abs)) {
      return abs;
    }
  }
  return undefined;
}

/** Page plus layout files from that folder up to the app root (inclusive). */
export function shellCandidateFiles(appDir: string, pageAbs: string): string[] {
  const files = [pageAbs];
  let dir = dirname(pageAbs);
  const root = appDir.replace(/[\\/]+$/, "");
  for (;;) {
    const layout = layoutPath(dir);
    if (layout && layout !== pageAbs) {
      files.push(layout);
    }
    if (dir === root) {
      break;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return files;
}

export function innerRouteUsesShell(appDir: string, pageAbs: string): boolean {
  return shellCandidateFiles(appDir, pageAbs).some((file) =>
    sourceUsesSiteShell(readFileSync(file, "utf8")),
  );
}

export function innerRoutesMissingShell(appDir: string): string[] {
  return listInnerRouteFiles(appDir)
    .filter((file) => !innerRouteUsesShell(appDir, file.abs))
    .map((file) => file.rel);
}
