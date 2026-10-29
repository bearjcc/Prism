import {
  MARKETPLACE_BRIDGE_VERSION,
  MARKETPLACE_EXTENSION_SOURCE,
  MARKETPLACE_INSTALL_ACK_TYPE,
  MARKETPLACE_PONG_TYPE,
  isCataloguePackageOrigin,
  parseMarketplaceInstallRequest,
  parseMarketplacePing,
} from "@prism/schema/marketplace-bridge";

export type MarketplaceBridgeRuntime = {
  sendMessage<T>(message: unknown): Promise<T>;
  getManifest(): { version: string };
};

export type MarketplaceBridgeHost = {
  readonly location: Pick<Location, "origin" | "href">;
  readonly documentElement: HTMLElement;
  readonly addEventListener: Window["addEventListener"];
  readonly postMessage: Window["postMessage"];
};

export { isCataloguePackageOrigin };

export function pageOriginFromUrl(pageUrl: string | undefined): string | undefined {
  if (pageUrl === undefined) {
    return undefined;
  }
  try {
    return new URL(pageUrl).origin;
  } catch {
    return undefined;
  }
}

export function applyMarketplaceBridgeAttributes(
  documentElement: HTMLElement,
  extensionVersion: string,
): void {
  documentElement.dataset.prism = "1";
  documentElement.dataset.prismExtensionVersion = extensionVersion;
  documentElement.dataset.prismBridgeVersion = String(MARKETPLACE_BRIDGE_VERSION);
}

export function buildMarketplacePong(options: {
  readonly extensionVersion: string;
  readonly installedMods: ReadonlyArray<{
    readonly packageId: string;
    readonly version: string;
    readonly enabled: boolean;
  }>;
}) {
  return {
    source: MARKETPLACE_EXTENSION_SOURCE,
    type: MARKETPLACE_PONG_TYPE,
    bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
    extensionVersion: options.extensionVersion,
    installedMods: options.installedMods,
  };
}

export async function fetchMarketplaceBridgeState(
  runtime: MarketplaceBridgeRuntime,
): Promise<{
  readonly extensionVersion: string;
  readonly installedMods: ReadonlyArray<{
    readonly packageId: string;
    readonly version: string;
    readonly enabled: boolean;
  }>;
}> {
  const response = await runtime.sendMessage<{
    readonly extensionVersion?: string;
    readonly installedMods?: ReadonlyArray<{
      readonly packageId: string;
      readonly version: string;
      readonly enabled: boolean;
    }>;
  }>({ type: "get-marketplace-bridge-state" });
  return {
    extensionVersion: response.extensionVersion ?? runtime.getManifest().version,
    installedMods: response.installedMods ?? [],
  };
}

export function installCatalogueMarketplaceBridge(
  host: MarketplaceBridgeHost,
  runtime: MarketplaceBridgeRuntime,
): void {
  if (!isCataloguePackageOrigin(host.location.origin)) {
    return;
  }

  let cached:
    | {
        readonly extensionVersion: string;
        readonly installedMods: ReadonlyArray<{
          readonly packageId: string;
          readonly version: string;
          readonly enabled: boolean;
        }>;
      }
    | undefined;

  const publish = async (): Promise<void> => {
    try {
      cached = await fetchMarketplaceBridgeState(runtime);
      applyMarketplaceBridgeAttributes(host.documentElement, cached.extensionVersion);
    } catch {
      // Leave server-rendered install fallback when the extension is unavailable.
    }
  };

  void publish();

  host.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== globalThis.window) {
      return;
    }
    if (event.origin !== host.location.origin) {
      return;
    }
    if (parseMarketplacePing(event.data, host.location.origin).ok) {
      void publish().then(() => {
        if (cached === undefined) {
          return;
        }
        host.postMessage(buildMarketplacePong(cached), host.location.origin);
      });
      return;
    }
    const installRequest = parseMarketplaceInstallRequest(
      event.data,
      host.location.origin,
    );
    if (!installRequest.ok) {
      return;
    }
    void runtime
      .sendMessage<{ readonly ok?: boolean; readonly error?: string }>({
        type: "marketplace-install-request",
        packageId: installRequest.packageId,
        version: installRequest.version,
        pageUrl: host.location.href,
      })
      .then((response) => {
        if (response.ok === true) {
          host.postMessage(
            {
              source: MARKETPLACE_EXTENSION_SOURCE,
              type: MARKETPLACE_INSTALL_ACK_TYPE,
              bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
              packageId: installRequest.packageId,
            },
            host.location.origin,
          );
        }
      })
      .catch(() => undefined);
  });
}
