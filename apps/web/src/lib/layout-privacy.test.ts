import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webSrc = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string): string {
  return readFileSync(join(webSrc, rel), "utf8");
}

const TRACKERS =
  /googletagmanager|google-analytics|gtag\(|plausible\.io|umami|segment\.com|mixpanel|sentry\.io|hotjar|fullstory|consent.?banner|cookie.?banner/i;

describe("no telemetry consent gate", () => {
  it("keeps the root layout first-party only", () => {
    const layout = read("app/layout.tsx");
    expect(layout).not.toMatch(TRACKERS);
    expect(layout).not.toMatch(/<script[^>]+src=/i);
    expect(layout).toContain("<body>{children}</body>");
  });

  it("does not ship a consent banner or third-party analytics in the site shell", () => {
    const files = [
      "app/layout.tsx",
      "components/site-shell.tsx",
      "components/site-chrome.tsx",
      "components/theme.tsx",
    ];
    for (const file of files) {
      expect(read(file), file).not.toMatch(TRACKERS);
    }
  });
});
