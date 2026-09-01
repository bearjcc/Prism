import Link from "next/link";
import { SiteNav } from "./site-nav";

type Props = {
  current?: string;
};

export function SiteHeader({ current }: Props) {
  return (
    <header className="topnav inner">
      <Link className="brand" href="/">
        <span className="mark" aria-hidden="true" />
        Prism
      </Link>
      <SiteNav current={current} />
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="footer inner">
      <a href="https://github.com/bearjcc/Prism">Source</a>
      <Link href="/about">About</Link>
      <span>Use it for nothing. Pay only if you want Prism to sync for you.</span>
    </footer>
  );
}
