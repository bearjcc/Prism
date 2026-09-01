import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { packMod } from "@prism/schema";
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

    await page.evaluate(() => {
      const slot = document.createElement("ytd-ad-slot-renderer");
      slot.textContent = "Late live advert";
      document.querySelector("main")?.append(slot);
    });
    await expect(
      page.locator("ytd-ad-slot-renderer img[data-prism-owned]"),
    ).toHaveCount(1);

    const popup = await session.context.newPage();
    await popup.goto(`chrome-extension://${session.extensionId}/popup.html`);
    await expect(popup.locator("#activity")).toContainText(
      "prism.kitten-ad-replace visual.ad-slot.replace allowed",
    );
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

test("SPA navigation from Home to watch re-runs the watch tracer", async () => {
  const session = await launchExtensionContext();
  try {
    const page = await session.context.newPage();
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

test("popup can import a packed .prism zip", async () => {
  const packed = packMod(
    join(repoRoot, "packages", "schema", "test", "fixtures", "golden"),
  );
  const archivePath = join(tmpdir(), `prism-import-${Date.now()}.prism`);
  writeFileSync(archivePath, packed.archive);
  const session = await launchExtensionContext();
  try {
    const page = await session.context.newPage();
    await page.goto(`chrome-extension://${session.extensionId}/popup.html`);
    await page.locator("#import-mod").setInputFiles(archivePath);
    await expect(
      page.getByRole("heading", { name: "golden.mod (imported)" }),
    ).toBeVisible();
  } finally {
    await session.close();
    rmSync(archivePath, { force: true });
  }
});

test("popup shows why a package with disallowed code was refused", async () => {
  const manifest = readFileSync(
    join(repoRoot, "packages", "schema", "test", "fixtures", "golden", "prism.yaml"),
    "utf8",
  );
  const archivePath = join(tmpdir(), `prism-refused-${Date.now()}.prism`);
  writeFileSync(
    archivePath,
    zipSync({
      "prism.yaml": strToU8(manifest),
      "src/index.js": strToU8(
        "export function activate(prism) { return document.body; }",
      ),
    }),
  );
  const session = await launchExtensionContext();
  try {
    const page = await session.context.newPage();
    await page.goto(`chrome-extension://${session.extensionId}/popup.html`);
    await page.locator("#import-mod").setInputFiles(archivePath);
    await expect(page.locator("#import-feedback")).toContainText(
      "document is not available to native mod code",
    );
  } finally {
    await session.close();
    rmSync(archivePath, { force: true });
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
