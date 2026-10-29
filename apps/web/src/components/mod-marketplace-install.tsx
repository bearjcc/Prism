"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MARKETPLACE_BRIDGE_VERSION,
  MARKETPLACE_EXTENSION_SOURCE,
  MARKETPLACE_INSTALL_ACK_TYPE,
  MARKETPLACE_INSTALL_REQUEST_TYPE,
  MARKETPLACE_PAGE_SOURCE,
  MARKETPLACE_PING_TYPE,
  MARKETPLACE_PONG_TYPE,
  type MarketplacePongPayload,
} from "@prism/schema/marketplace-bridge";
import { CHROME_STORE, GITHUB_RELEASES_URL } from "../lib/extension-store";

type Props = {
  className?: string;
  packageId: string;
  version: string;
  minExtensionVersion?: string;
};

type BridgeState = {
  extensionVersion: string;
  installedMods: ReadonlyArray<{
    packageId: string;
    version: string;
    enabled: boolean;
  }>;
};

function isFirefox(): boolean {
  return /firefox/i.test(navigator.userAgent);
}

function readInitialBridgeState(): BridgeState | null {
  if (typeof document === "undefined") {
    return null;
  }
  const version = document.documentElement.dataset.prismExtensionVersion;
  if (document.documentElement.dataset.prism !== "1" || version === undefined) {
    return null;
  }
  return { extensionVersion: version, installedMods: [] };
}

export function ModMarketplaceInstall({
  className,
  packageId,
  version,
  minExtensionVersion = "0.1.2",
}: Props) {
  const [bridge, setBridge] = useState<BridgeState | null>(() => readInitialBridgeState());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [firefox] = useState(() => isFirefox());

  const refreshBridge = useCallback(() => {
    window.postMessage(
      {
        source: MARKETPLACE_PAGE_SOURCE,
        type: MARKETPLACE_PING_TYPE,
        bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
      },
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as MarketplacePongPayload;
      if (
        data?.source !== MARKETPLACE_EXTENSION_SOURCE ||
        data?.type !== MARKETPLACE_PONG_TYPE
      ) {
        return;
      }
      setBridge({
        extensionVersion: data.extensionVersion,
        installedMods: data.installedMods,
      });
    };
    window.addEventListener("message", onMessage);
    refreshBridge();
    return () => window.removeEventListener("message", onMessage);
  }, [refreshBridge]);

  const installed = bridge?.installedMods.find((mod) => mod.packageId === packageId);

  const requestInstall = () => {
    setPending(true);
    setError(null);
    const onAck = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as { type?: string; packageId?: string };
      if (
        data?.type === MARKETPLACE_INSTALL_ACK_TYPE &&
        data.packageId === packageId
      ) {
        window.removeEventListener("message", onAck);
        setPending(false);
        refreshBridge();
      }
    };
    window.addEventListener("message", onAck);
    window.postMessage(
      {
        source: MARKETPLACE_PAGE_SOURCE,
        type: MARKETPLACE_INSTALL_REQUEST_TYPE,
        bridgeVersion: MARKETPLACE_BRIDGE_VERSION,
        packageId,
        version,
      },
      window.location.origin,
    );
  };

  if (firefox) {
    return <span className={className}>Available on Chromium</span>;
  }

  if (bridge === null) {
    return (
      <a className={className ?? "btn btn-solid"} href={CHROME_STORE}>
        Get Prism extension
      </a>
    );
  }

  if (
    minExtensionVersion !== undefined &&
    bridge.extensionVersion.localeCompare(minExtensionVersion, undefined, {
      numeric: true,
      sensitivity: "base",
    }) < 0
  ) {
    return (
      <p className={className}>
        Needs Prism v{minExtensionVersion}.{" "}
        <a href={GITHUB_RELEASES_URL}>Update the extension</a>.
      </p>
    );
  }

  if (installed !== undefined && installed.enabled) {
    return <p className={className}>Enabled in Prism</p>;
  }

  if (installed !== undefined) {
    return (
      <p className={className}>
        Installed in Prism. Open Prism settings and enable {packageId}.
      </p>
    );
  }

  return (
    <p className={className}>
      <button
        type="button"
        className="btn btn-solid"
        disabled={pending}
        onClick={requestInstall}
      >
        {pending ? "Opening Prism..." : "Add to Prism"}
      </button>
      {error !== null ? <span>{error}</span> : null}
    </p>
  );
}
