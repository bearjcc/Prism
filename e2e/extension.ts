import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  chromium,
  type BrowserContext,
  type Worker,
} from "@playwright/test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const extensionPath = join(
  repoRoot,
  "apps",
  "extension",
  "targets",
  "chrome",
);

export async function launchExtensionContext(): Promise<{
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
  close: () => Promise<void>;
}> {
  const userDataDir = await mkdtemp(join(tmpdir(), "prism-e2e-"));
  const loadRoot = await mkdtemp(join(tmpdir(), "prism-ext-"));
  await cp(extensionPath, loadRoot, { recursive: true });
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
    async close() {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
      await rm(loadRoot, { recursive: true, force: true });
    },
  };
}
