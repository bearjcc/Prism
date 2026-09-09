import type { Metadata } from "next";
import { ExploreBrowser, parseExploreSearch } from "../../components/explore-browser";
import { SiteShell } from "../../components/site-shell";

export const metadata: Metadata = { title: "Explore" };

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ExplorePage({ searchParams }: Props) {
  const filters = parseExploreSearch(await searchParams);

  return (
    <SiteShell current="explore">
      <div className="page-head">
        <h1>Explore</h1>
        <p>First-party Prism tracer mods, bundled in the extension. No account required to browse or install.</p>
      </div>
      <ExploreBrowser {...filters} />
    </SiteShell>
  );
}
