import type { BrowserContext } from "@playwright/test";

export type ExtensionSession = {
  context: BrowserContext;
  extensionId: string;
  extensionUrl: (path: string) => string;
  close: () => Promise<void>;
};
