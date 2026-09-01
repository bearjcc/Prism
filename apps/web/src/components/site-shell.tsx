import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./site-chrome";
import { ThemeBoot } from "./theme";

export function SiteShell({
  children,
  current,
}: {
  children: ReactNode;
  current?: string;
}) {
  return (
    <div className="site-wrap" data-surface="site">
      <ThemeBoot />
      <SiteHeader current={current} />
      <main className="inner">{children}</main>
      <SiteFooter />
    </div>
  );
}
