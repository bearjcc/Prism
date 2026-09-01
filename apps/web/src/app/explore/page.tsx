import type { Metadata } from "next";
import { ExploreBrowser } from "../../components/explore-browser";
import { SiteShell } from "../../components/site-shell";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <SiteShell current="explore">
      <div className="page-head">
        <h1>Explore</h1>
        <p>Browse public mods. No account required to install.</p>
      </div>
      <ExploreBrowser />
    </SiteShell>
  );
}
