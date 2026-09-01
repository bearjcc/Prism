"use client";

import { useEffect, useState } from "react";

const STORE = "https://chromewebstore.google.com/";

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
};

export function InstallControl({ className, labelInstall = "Install plugin" }: Props) {
  const [installed, setInstalled] = useState(false);
  const [firefox, setFirefox] = useState(false);

  useEffect(() => {
    setInstalled(extensionPresent());
    setFirefox(isFirefox());
  }, []);

  if (installed) {
    return (
      <button type="button" className={className} disabled>
        Installed
      </button>
    );
  }

  if (firefox) {
    return (
      <span className={className}>
        Available on Chromium
      </span>
    );
  }

  return (
    <a className={className ?? "btn btn-solid"} href={STORE}>
      {labelInstall}
    </a>
  );
}
