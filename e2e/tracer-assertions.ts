import { expect, type Page } from "@playwright/test";
import type { ExtensionSession } from "./extension-session.js";
import { homeFixture, watchFixture } from "./tracer-fixtures.js";

export async function assertKittenTracerOnFixture(
  page: Page,
  session: ExtensionSession,
  origin: string,
): Promise<void> {
  await page.goto(`${origin}/kitten/ads.html`);
  await expect(
    page.locator('[data-prism-ad-slot="banner"] img[data-prism-owned]'),
  ).toHaveCount(1);
  await expect(
    page.locator('[data-prism-ad-slot="sidebar"] img[data-prism-owned]'),
  ).toHaveCount(1);

  const bannerFootprint = await page.evaluate(() => {
    const slot = document.querySelector('[data-prism-ad-slot="banner"]');
    const image = slot?.querySelector("img[data-prism-owned]");
    if (slot === null || image === null) {
      return null;
    }
    const slotRect = slot.getBoundingClientRect();
    return {
      slotWidth: slotRect.width,
      slotHeight: slotRect.height,
      imageWidth: image.clientWidth,
      imageHeight: image.clientHeight,
    };
  });
  expect(bannerFootprint).not.toBeNull();
  expect(
    Math.abs(bannerFootprint!.slotWidth - bannerFootprint!.imageWidth),
  ).toBeLessThanOrEqual(2);
  expect(
    Math.abs(bannerFootprint!.slotHeight - bannerFootprint!.imageHeight),
  ).toBeLessThanOrEqual(2);

  await expect(page.getByText("The article remains untouched.")).toBeVisible();

  await page.evaluate(() => {
    const slot = document.createElement("ytd-ad-slot-renderer");
    slot.textContent = "Late live advert";
    document.querySelector("main")?.append(slot);
  });
  await expect(
    page.locator("ytd-ad-slot-renderer img[data-prism-owned]"),
  ).toHaveCount(1);

  if (session.canNavigateExtensionPages) {
    const popup = await session.context.newPage();
    await popup.goto(session.extensionUrl("popup.html"));
    await expect(popup.locator("#activity")).toContainText(
      "prism.kitten-ad-replace visual.ad-slot.replace allowed",
    );
    await popup.close();
  }
}

export async function assertYoutubeHomeTracer(page: Page): Promise<void> {
  await stubYoutubeHtml(page, { "/": homeFixture });
  await page.goto("https://www.youtube.com/");
  await expect(
    page.locator('[data-prism-owned="youtube-home-video"]'),
  ).toHaveCount(2);
  await expect(page.getByText("Alpha video")).toBeVisible();
  await expect(page.getByText("Beta video")).toBeVisible();
  await expect(page.locator("[data-fixture-kind]")).toHaveCount(0);
}

export async function assertYoutubeSpaWatchTracer(page: Page): Promise<void> {
  await stubYoutubeHtml(page, { "/": homeFixture });
  await page.goto("https://www.youtube.com/");
  await expect(
    page.locator('[data-prism-owned="youtube-home-video"]'),
  ).toHaveCount(2);

  await page.evaluate(() => {
    history.pushState({}, "", "/watch?v=fixture-video-id");
    const comments = document.createElement("ytd-comments");
    comments.id = "comments";
    comments.setAttribute("data-prism-comments-slot", "youtube-comments");
    document.body.append(comments);
    window.dispatchEvent(new Event("yt-navigate-finish"));
  });

  await expect(page.locator("[data-prism-comments-fallback]")).toContainText(
    "Enable Reddit comments",
  );
}

export async function assertYoutubeWatchRedditFallback(
  page: Page,
): Promise<void> {
  await stubYoutubeHtml(page, { "/watch": watchFixture });
  await page.goto("https://www.youtube.com/watch?v=fixture-video-id");
  await expect(page.getByText("Fixture watch page")).toBeVisible();
  await expect(page.locator("[data-prism-comments-fallback]")).toContainText(
    "Enable Reddit comments",
  );
}

export async function stubYoutubeHtml(
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
