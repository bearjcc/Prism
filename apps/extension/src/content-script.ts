interface ContentRuntime {
  readonly runtime: {
    sendMessage(message: unknown): Promise<unknown>;
  };
}

declare const chrome: ContentRuntime;

void chrome.runtime.sendMessage({
  type: "active-mods",
  url: globalThis.location.href,
});
