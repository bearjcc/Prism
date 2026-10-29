"use client";

import { useEffect, useState } from "react";
import { EXTENSION_INSTALL_PATH } from "../lib/extension-store";

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

  useEffect(() => {
    setInstalled(extensionPresent());
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

  return (
    <a className={className ?? "btn btn-solid"} href={EXTENSION_INSTALL_PATH}>
      {labelInstall}
    </a>
  );
}
