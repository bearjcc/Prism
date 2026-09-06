import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { firefox } from "@playwright/test";
import { connect, findFreeTcpPort } from "./vendor/web-ext-firefox-remote.js";
import type { ExtensionSession } from "./extension-session.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export const firefoxExtensionPath = join(
  repoRoot,
  "apps",
  "extension",
  "targets",
  "firefox",
);

export async function launchFirefoxExtensionContext(): Promise<ExtensionSession> {
  const userDataDir = await mkdtemp(join(tmpdir(), "prism-e2e-firefox-"));
  const loadRoot = await mkdtemp(join(tmpdir(), "prism-ext-firefox-"));
  await cp(firefoxExtensionPath, loadRoot, { recursive: true });

  const rdpPort = await findFreeTcpPort();
  const context = await firefox.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`-start-debugger-server=${rdpPort}`],
    firefoxUserPrefs: {
      "devtools.debugger.remote-enabled": true,
      "devtools.debugger.prompt-connection": false,
      "extensions.autoDisableScopes": 0,
      "extensions.enabledScopes": 15,
    },
  });

  const remote = await connect(rdpPort);
  const installResult = await remote.installTemporaryAddon(loadRoot);
  const extensionId = installResult.addon.id;
  if (extensionId === undefined || extensionId.length === 0) {
    remote.disconnect();
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
    await rm(loadRoot, { recursive: true, force: true });
    throw new Error("Firefox temporary add-on install returned no extension id");
  }

  return {
    context,
    extensionId,
    extensionUrl(path: string) {
      return `moz-extension://${extensionId}/${path}`;
    },
    async close() {
      remote.disconnect();
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
      await rm(loadRoot, { recursive: true, force: true });
    },
  };
}
