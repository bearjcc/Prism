"use client";

import { useEffect, useState } from "react";
import { CHROME_STORE } from "../lib/extension-store";

function isFirefox(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /firefox/i.test(navigator.userAgent);
}

function extensionPresent(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.documentElement.dataset.prism === "1";
}

type Props = {
  className?: string;
  labelInstall?: string;
  /** When set, copy reflects enabling a bundled mod after the extension is present. */
  packageId?: string;
};

export function InstallControl({
  className,
  labelInstall = "Install plugin",
  packageId,
}: Props) {
  const [installed, setInstalled] = useState(false);
  const [firefox, setFirefox] = useState(false);

  useEffect(() => {
    setInstalled(extensionPresent());
    setFirefox(isFirefox());
  }, []);

  if (installed) {
    return (
      <p className={className}>
        {packageId
          ? `Prism is installed. Open the popup on a matching page and enable ${packageId}.`
          : "Prism extension installed."}
      </p>
    );
  }

  if (firefox) {
    return <span className={className}>Available on Chromium</span>;
  }

  return (
    <a className={className ?? "btn btn-solid"} href={CHROME_STORE}>
      {labelInstall}
    </a>
  );
}
