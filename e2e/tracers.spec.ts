import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { launchExtensionContext } from "./extension.js";
import { startFixtureServer } from "./fixture-server.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const homeFixture = readFileSync(
  join(repoRoot, "mods", "youtube-home-videos", "fixtures", "home.html"),
  "utf8",
);
const watchFixture = readFileSync(
  join(
    repoRoot,
    "mods",
    "youtube-reddit-comments",
    "fixtures",
    "watch.html",
  ),
  "utf8",
);

test.describe.configure({ mode: "serial" });

test("kitten fixture slots become bundled images", async () => {
  const server = await startFixtureServer();
  const session = await launchExtensionContext();
  try {
    const page = await session.context.newPage();
    await page.goto(`${server.origin}/kitten/ads.html`);
    await expect(
      page.locator('[data-prism-ad-slot="banner"] img[data-prism-owned]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-prism-ad-slot="sidebar"] img[data-prism-owned]'),
    ).toHaveCount(1);
    await expect(page.getByText("The article remains untouched.")).toBeVisible();
  } finally {
    await session.close();
    await server.close();
  }
});

test("YouTube Home fixture keeps videos and drops non-video units", async () => {
  const session = await launchExtensionContext();
  try {
    const page = await session.context.newPage();
    await stubYoutubeHtml(page, { "/": homeFixture });
    await page.goto("https://www.youtube.com/");
    await expect(
      page.locator('[data-prism-owned="youtube-home-video"]'),
    ).toHaveCount(2);
    await expect(page.getByText("Alpha video")).toBeVisible();
    await expect(page.getByText("Beta video")).toBeVisible();
    await expect(page.locator("[data-fixture-kind]")).toHaveCount(0);
  } finally {
    await session.close();
  }
});

test("YouTube watch fixture shows Reddit fallback without a live fetch", async () => {
  const session = await launchExtensionContext();
  try {
    const page = await session.context.newPage();
    await stubYoutubeHtml(page, { "/watch": watchFixture });
    await page.goto("https://www.youtube.com/watch?v=fixture-video-id");
    await expect(page.getByText("Fixture watch page")).toBeVisible();
    await expect(page.locator("[data-prism-comments-fallback]")).toContainText(
      "Enable Reddit comments",
    );
  } finally {
    await session.close();
  }
});

async function stubYoutubeHtml(
  page: Page,
  pages: Readonly<Record<string, string>>,
): Promise<void> {
  await page.route(
    (url) => url.hostname === "www.youtube.com",
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      const body = pages[pathname];
      if (body === undefined) {
        await route.abort();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body,
      });
    },
  );
}
