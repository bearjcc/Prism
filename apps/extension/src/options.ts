import { mountOptions } from "./popup.js";

interface OptionsChromeApi {
  readonly runtime: {
    sendMessage<T>(message: unknown): Promise<T>;
    openOptionsPage?(): void;
  };
  readonly permissions: {
    request(permissions: { origins: string[] }): Promise<boolean>;
    remove(permissions: { origins: string[] }): Promise<boolean>;
  };
  readonly tabs: {
    query(query: { active: true; currentWindow: true }): Promise<
      Array<{ id?: number; url?: string }>
    >;
    create?(properties: { url: string }): Promise<unknown>;
  };
}

declare const chrome: OptionsChromeApi;

if (typeof document !== "undefined" && typeof chrome !== "undefined") {
  void mountOptions(chrome, document);
}
