import type { BrowserContext } from "@playwright/test";

export type ExtensionSession = {
  context: BrowserContext;
  extensionId: string;
  extensionUrl: (path: string) => string;
  /** Chromium allows direct popup URLs; Firefox automation returns NS_ERROR_NOT_AVAILABLE. */
  canNavigateExtensionPages: boolean;
  close: () => Promise<void>;
};
