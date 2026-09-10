import { test } from "@playwright/test";
import { launchFirefoxExtensionContext } from "./firefox-extension.js";
import { startFixtureServer } from "./fixture-server.js";
import {
  assertFacebookHomeTracer,
  assertKittenTracerOnFixture,
  assertLinkedinHomeTracer,
  assertYoutubeHomeTracer,
  assertYoutubeSpaWatchTracer,
  assertYoutubeWatchRedditFallback,
} from "./tracer-assertions.js";

test.describe.configure({ mode: "serial" });

test("kitten fixture slots become bundled images", async () => {
  const server = await startFixtureServer();
  const session = await launchFirefoxExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertKittenTracerOnFixture(page, session, server.origin);
  } finally {
    await session.close();
    await server.close();
  }
});

test("YouTube Home fixture keeps videos and drops non-video units", async () => {
  const session = await launchFirefoxExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertYoutubeHomeTracer(page);
  } finally {
    await session.close();
  }
});

test("LinkedIn Home fixture keeps 1st-degree posts and strips the rest", async () => {
  const session = await launchFirefoxExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertLinkedinHomeTracer(page);
  } finally {
    await session.close();
  }
});

test("Facebook Home fixture keeps friend posts and strips the rest", async () => {
  const session = await launchFirefoxExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertFacebookHomeTracer(page);
  } finally {
    await session.close();
  }
});

test("SPA navigation from Home to watch re-runs the watch tracer", async () => {
  const session = await launchFirefoxExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertYoutubeSpaWatchTracer(page);
  } finally {
    await session.close();
  }
});

test("YouTube watch fixture shows Reddit fallback without a live fetch", async () => {
  const session = await launchFirefoxExtensionContext();
  try {
    const page = await session.context.newPage();
    await assertYoutubeWatchRedditFallback(page);
  } finally {
    await session.close();
  }
});
