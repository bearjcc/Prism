import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { packMod } from "@prism/schema";
import { expect, test } from "@playwright/test";
import { launchChromeExtensionContext } from "./extension.js";
import { startFixtureServer } from "./fixture-server.js";
import {
  assertFacebookHomeTracer,
  assertKittenTracerOnFixture,
  assertLinkedinHomeTracer,
  assertYoutubeHomeTracer,
  assertYoutubeSpaWatchTracer,
  assertYoutubeWatchRedditFallback,
  assertYoutubeWatchRedditLiveFixture,
} from "./tracer-assertions.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test.describe.configure({ mode: "serial" });

test("kitten fixture slots become bundled images", async () => {
  const server = await startFixtureServer();
  const session = await launchChromeExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertKittenTracerOnFixture(page, session, server.origin);
  } finally {
    await session.close();
    await server.close();
  }
});

test("YouTube Home fixture keeps videos and drops non-video units", async () => {
  const session = await launchChromeExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertYoutubeHomeTracer(page);
  } finally {
    await session.close();
  }
});

test("LinkedIn Home fixture keeps 1st-degree posts and strips the rest", async () => {
  const session = await launchChromeExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertLinkedinHomeTracer(page);
  } finally {
    await session.close();
  }
});

test("Facebook Home fixture keeps friend posts and strips the rest", async () => {
  const session = await launchChromeExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertFacebookHomeTracer(page);
  } finally {
    await session.close();
  }
});

test("SPA navigation from Home to watch re-runs the watch tracer", async () => {
  const session = await launchChromeExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertYoutubeSpaWatchTracer(page);
  } finally {
    await session.close();
  }
});

test("YouTube watch fixture shows Reddit fallback without a live fetch", async () => {
  const session = await launchChromeExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertYoutubeWatchRedditFallback(page);
  } finally {
    await session.close();
  }
});

test("YouTube live-shaped watch fixture mounts Reddit fallback", async () => {
  const session = await launchChromeExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertYoutubeWatchRedditLiveFixture(page);
  } finally {
    await session.close();
  }
});

test("options page can import a packed .prism zip", async () => {
  const packed = packMod(
    join(repoRoot, "packages", "schema", "test", "fixtures", "golden"),
  );
  const archivePath = join(tmpdir(), `prism-import-${Date.now()}.prism`);
  writeFileSync(archivePath, packed.archive);
  const session = await launchChromeExtensionContext();
  try {
    const page = await session.context.newPage();
    await page.goto(session.extensionUrl("options.html"));
    await page.locator("#import-mod").setInputFiles(archivePath);
    await expect(page.locator("#import-feedback")).toContainText(
      "Imported golden.mod",
    );
    await expect(
      page.getByRole("heading", { name: "golden.mod (imported)" }),
    ).toBeVisible();
  } finally {
    await session.close();
    rmSync(archivePath, { force: true });
  }
});

test("options page shows why a package with disallowed code was refused", async () => {
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
  const session = await launchChromeExtensionContext();
  try {
    const page = await session.context.newPage();
    await page.goto(session.extensionUrl("options.html"));
    await page.locator("#import-mod").setInputFiles(archivePath);
    await expect(page.locator("#import-feedback")).toContainText(
      "document is not available to native mod code",
    );
  } finally {
    await session.close();
    rmSync(archivePath, { force: true });
  }
});
