"use client";

import { useEffect } from "react";
import { detectBrowserFromUserAgent, type BrowserFamily } from "../lib/browser-detect";

type Props = {
  primaryBrowser: BrowserFamily;
};

/** Refines install section order when navigator UA differs from the server hint. */
export function InstallPageEnhance({ primaryBrowser }: Props) {
  useEffect(() => {
    const root = document.getElementById("install-options");
    if (root === null) {
      return;
    }
    const refined = detectBrowserFromUserAgent(navigator.userAgent);
    if (refined !== primaryBrowser) {
      root.setAttribute("data-primary-browser", refined);
    }
  }, [primaryBrowser]);

  return null;
}
