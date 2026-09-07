import Link from "next/link";
import { ModShot } from "./mod-shot";
import {
  SITE_CHIPS,
  catalogue,
  filterCatalogue,
  formatInstalls,
  formatRating,
  type CatalogueListing,
  type ExploreSort,
} from "../lib/catalogue";

export type ExploreSearch = {
  q: string;
  sort: ExploreSort;
  site: string | null;
};

function parseExploreSort(value: string | undefined): ExploreSort {
  return value === "recent" ? "recent" : "popular";
}

export function parseExploreSearch(
  params: Record<string, string | string[] | undefined>,
): ExploreSearch {
  const rawQ = params.q;
  const rawSort = params.sort;
  const rawSite = params.site;
  const q = typeof rawQ === "string" ? rawQ : "";
  const sort = parseExploreSort(typeof rawSort === "string" ? rawSort : undefined);
  const site =
    typeof rawSite === "string" && SITE_CHIPS.includes(rawSite as (typeof SITE_CHIPS)[number])
      ? rawSite
      : null;
  return { q, sort, site };
}

function capabilityHint(capabilities: CatalogueListing["capabilities"]): string {
  const cap = capabilities.find((entry) => entry.required) ?? capabilities[0];
  if (!cap) {
    return "";
  }
  const sentence = cap.summary.split(".")[0]?.trim();
  return sentence ?? cap.summary;
}

function exploreHref(next: ExploreSearch): string {
  const params = new URLSearchParams();
  if (next.q.trim()) {
    params.set("q", next.q.trim());
  }
  if (next.sort !== "popular") {
    params.set("sort", next.sort);
  }
  if (next.site) {
    params.set("site", next.site);
  }
  const query = params.toString();
  return query ? `/explore?${query}` : "/explore";
}

export function ExploreBrowser({ q, sort, site }: ExploreSearch) {
  const list = filterCatalogue(catalogue(), q, sort, site);

  return (
    <>
      <form className="toolbar" method="get" action="/explore">
        <input
          className="search"
          name="q"
          defaultValue={q}
          placeholder="Search mods"
          aria-label="Search mods"
        />
        <div className="toolbar-row">
          <div className="tabs" role="group" aria-label="Sort">
            {(["popular", "recent"] as const).map((value) =>
              value === sort ? (
                <button key={value} type="button" className="tab-active" aria-pressed="true">
                  {value === "popular" ? "Popular" : "Recent"}
                </button>
              ) : (
                <button key={value} type="submit" name="sort" value={value}>
                  {value === "popular" ? "Popular" : "Recent"}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="toolbar-row">
          <span className="toolbar-label" id="by-site-label">
            By site
          </span>
          <div className="chips" role="group" aria-labelledby="by-site-label">
            {SITE_CHIPS.map((host) => {
              const active = site === host;
              if (active) {
                return (
                  <Link
                    key={host}
                    className="chip-active"
                    href={exploreHref({ q, sort, site: null })}
                    aria-current="true"
                  >
                    {host}
                  </Link>
                );
              }
              return (
                <button key={host} type="submit" name="site" value={host}>
                  {host}
                </button>
              );
            })}
          </div>
        </div>
        {sort !== "popular" ? <input type="hidden" name="sort" value={sort} /> : null}
        {site ? <input type="hidden" name="site" value={site} /> : null}
      </form>
      {list.length === 0 ? (
        <p className="empty">No mods match that search.</p>
      ) : (
        <div className="grid">
          {list.map((mod) => (
            <Link key={mod.id} className="card" href={`/mods/${mod.id}`}>
              <ModShot src={mod.previewSrc} alt={mod.previewAlt} />
              <div className="card-meta">
                <h2>{mod.name}</h2>
                <p className="card-byline">
                  <span>{mod.author}</span>
                  <span>{mod.site}</span>
                </p>
                <p className="card-summary">{mod.summary}</p>
                <p className="card-cap">{capabilityHint(mod.capabilities)}</p>
                <p className="card-stats">
                  <span>{formatInstalls(mod.installs)} installs</span>
                  <span>{formatRating(mod)}</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
