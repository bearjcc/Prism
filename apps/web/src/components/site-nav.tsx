"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";
import { SITE_NAV_WIDE } from "../lib/breakpoints";
import { InstallControl } from "./install-control";
import { ThemeToggle } from "./theme";

type Props = {
  current?: string;
};

export function SiteNav({ current }: Props) {
  const pathname = usePathname();
  const navId = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const wide = window.matchMedia(SITE_NAV_WIDE);
    function onChange() {
      if (wide.matches) {
        setOpen(false);
      }
    }
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls={navId}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close" : "Menu"}
      </button>
      <nav id={navId} className="nav-links" data-open={open ? "true" : undefined} aria-label="Site">
        <Link href="/explore" aria-current={current === "explore" ? "page" : undefined}>
          Explore
        </Link>
        <InstallControl className="ghost" labelInstall="Install" />
        <Link href="/explore">Enable mods</Link>
        <Link href="/create" aria-current={current === "create" ? "page" : undefined}>
          Create
        </Link>
        <Link href="/signin" aria-current={current === "signin" ? "page" : undefined}>
          Sign in
        </Link>
        <ThemeToggle />
      </nav>
    </>
  );
}
