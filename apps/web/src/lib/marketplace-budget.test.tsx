/** @vitest-environment node */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HomePage from "../app/page";
import ExplorePage from "../app/explore/page";
import ModPage from "../app/mods/[id]/page";
import { catalogue } from "./catalogue";
import { collectRouteSources, sourceByteLength } from "./route-source";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: ReactNode;
    href: string;
    className?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/",
  notFound: () => {
    throw new Error("notFound");
  },
}));

const webSrc = join(dirname(fileURLToPath(import.meta.url)), "..");

const TRACKERS =
  /googletagmanager|google-analytics|gtag\(|plausible\.io|umami|segment\.com|mixpanel|sentry\.io|hotjar|fullstory|consent.?banner|cookie.?banner|meilisearch|telemetry.?consent/i;

const ACCOUNT_GATE = /sign in to browse|create an account to (browse|install)|accept cookies to continue/i;

/* First-party UTF-8 source (page + relative imports). Measured 2026-08-29:
   / 26579, /explore 18157, /mods/:id 20625. */
const SOURCE_BUDGET_BYTES = 32_768;

/* renderToStaticMarkup of the route tree (no Next server). Measured 2026-08-29:
   / 9714, /explore 7247, /mods/:id 3169. */
const HTML_BUDGET_BYTES = 16_384;

function assertGuestHtml(html: string, label: string): void {
  expect(html.length, label).toBeGreaterThan(200);
  expect(Buffer.byteLength(html, "utf8"), `${label} html budget`).toBeLessThanOrEqual(
    HTML_BUDGET_BYTES,
  );
  expect(html, label).not.toMatch(TRACKERS);
  expect(html, label).not.toMatch(ACCOUNT_GATE);
  expect(html, label).not.toMatch(/<script[^>]+src=/i);
}

describe("marketplace HTML budget", () => {
  const homeEntry = join(webSrc, "app/page.tsx");
  const exploreEntry = join(webSrc, "app/explore/page.tsx");
  const modEntry = join(webSrc, "app/mods/[id]/page.tsx");

  it("keeps first-party source for home, explore, and a listing under budget", () => {
    for (const [label, entry] of [
      ["/", homeEntry],
      ["/explore", exploreEntry],
      ["/mods/:id", modEntry],
    ] as const) {
      const bytes = sourceByteLength(collectRouteSources(entry));
      expect(bytes, label).toBeGreaterThan(1_000);
      expect(bytes, `${label} source budget`).toBeLessThanOrEqual(SOURCE_BUDGET_BYTES);
    }
  });

  it("renders guest HTML for / with no telemetry consent path", () => {
    const html = renderToStaticMarkup(<HomePage />);
    assertGuestHtml(html, "/");
    expect(html).toContain("See the web in a new light");
    expect(html).toContain('data-surface="home"');
    expect(html).toContain("/explore");
  });

  it("renders guest HTML for /explore with listings and no account gate", () => {
    const html = renderToStaticMarkup(<ExplorePage />);
    assertGuestHtml(html, "/explore");
    for (const mod of catalogue()) {
      expect(html).toContain(mod.name);
      expect(html).toContain(`/mods/${mod.id}`);
    }
    expect(html).toContain("0 installs");
    expect(html).toContain("No ratings");
    expect(html).not.toMatch(/\d+(\.\d+)?k installs/);
    expect(html).not.toMatch(/\d+(\.\d+)?\/5/);
    expect(html).not.toMatch(/<form/i);
    expect(html).toContain("data-surface=\"site\"");
  });

  it("renders guest HTML for /mods/:id with install and no account gate", async () => {
    const listings = catalogue();
    const id = listings[0]?.id;
    expect(id).toBeTruthy();
    const tree = await ModPage({ params: Promise.resolve({ id: id as string }) });
    const html = renderToStaticMarkup(tree);
    assertGuestHtml(html, "/mods/:id");
    expect(html).toContain(listings[0]?.name as string);
    expect(html).toContain("0 installs");
    expect(html).toContain("No ratings");
    expect(html).toMatch(/Install/);
    expect(html).not.toMatch(/<form/i);
    expect(html).toContain("without an account");
  });
});
