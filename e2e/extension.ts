import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromium,
  type Worker,
} from "@playwright/test";
import type { ExtensionSession } from "./extension-session.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const chromeExtensionPath = join(
  repoRoot,
  "apps",
  "extension",
  "targets",
  "chrome",
);

export async function launchChromeExtensionContext(): Promise<
  ExtensionSession & { serviceWorker: Worker }
> {
  const userDataDir = await mkdtemp(join(tmpdir(), "prism-e2e-chrome-"));
  const loadRoot = await mkdtemp(join(tmpdir(), "prism-ext-chrome-"));
  await cp(chromeExtensionPath, loadRoot, { recursive: true });
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${loadRoot}`,
      `--load-extension=${loadRoot}`,
      "--disable-features=DisableLoadExtensionCommandLineSwitch",
    ],
  });

  let serviceWorker = context.serviceWorkers()[0];
  if (serviceWorker === undefined) {
    serviceWorker = await context.waitForEvent("serviceworker");
  }

  const extensionId = new URL(serviceWorker.url()).hostname;

  return {
    context,
    serviceWorker,
    extensionId,
    extensionUrl(path: string) {
      return `chrome-extension://${extensionId}/${path}`;
    },
    async close() {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
      await rm(loadRoot, { recursive: true, force: true });
    },
  };
}

/** @deprecated Use launchChromeExtensionContext */
export const extensionPath = chromeExtensionPath;
/** @deprecated Use launchChromeExtensionContext */
export const launchExtensionContext = launchChromeExtensionContext;
