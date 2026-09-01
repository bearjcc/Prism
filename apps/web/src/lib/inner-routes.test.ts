import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  innerRoutesMissingShell,
  isHomeRoute,
  listAppRouteFiles,
  listInnerRouteFiles,
} from "./inner-routes";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "../app");

describe("inner catalogue routes", () => {
  it("enumerates app pages from the app directory", () => {
    const rels = listAppRouteFiles(appDir).map((file) => file.rel);
    expect(rels).toContain("page.tsx");
    expect(rels).toContain("explore/page.tsx");
    expect(rels).toContain("mods/[id]/page.tsx");
    expect(rels).toContain("about/page.tsx");
    expect(rels).toContain("create/page.tsx");
    expect(rels).toContain("signin/page.tsx");
    expect(rels).toContain("not-found.tsx");
    expect(rels.filter(isHomeRoute)).toEqual(["page.tsx"]);
  });

  it("fails closed when an inner route skips SiteShell contrast tokens", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-web-routes-"));
    mkdirSync(join(dir, "explore"));
    writeFileSync(
      join(dir, "page.tsx"),
      'export default function Home() { return <div data-surface="home" />; }\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "explore", "page.tsx"),
      "export default function Explore() { return <main>Explore</main>; }\n",
      "utf8",
    );
    expect(listInnerRouteFiles(dir).map((file) => file.rel)).toEqual(["explore/page.tsx"]);
    expect(innerRoutesMissingShell(dir)).toEqual(["explore/page.tsx"]);
  });

  it("accepts SiteShell on the page or a parent layout", () => {
    const dir = mkdtempSync(join(tmpdir(), "prism-web-shell-"));
    mkdirSync(join(dir, "explore"));
    writeFileSync(join(dir, "page.tsx"), "export default function Home() { return null; }\n", "utf8");
    writeFileSync(
      join(dir, "layout.tsx"),
      'import { SiteShell } from "../site-shell";\nexport default function L({ children }) { return <SiteShell>{children}</SiteShell>; }\n',
      "utf8",
    );
    writeFileSync(
      join(dir, "explore", "page.tsx"),
      "export default function Explore() { return <p>Explore</p>; }\n",
      "utf8",
    );
    expect(innerRoutesMissingShell(dir)).toEqual([]);
  });

  it("requires every shipped inner route to use the site shell", () => {
    expect(innerRoutesMissingShell(appDir)).toEqual([]);
    const shell = readFileSync(join(appDir, "../components/site-shell.tsx"), "utf8");
    expect(shell).toContain('data-surface="site"');
  });
});
