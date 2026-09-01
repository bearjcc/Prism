"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ModShot } from "./mod-shot";
import {
  SITE_CHIPS,
  catalogue,
  filterCatalogue,
  formatInstalls,
  formatRating,
  type ExploreSort,
} from "../lib/catalogue";

export function ExploreBrowser() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ExploreSort>("popular");
  const [site, setSite] = useState<string | null>(null);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("q");
    if (next !== null && next !== "") {
      setQuery(next);
    }
  }, []);

  const list = useMemo(
    () => filterCatalogue(catalogue(), query, sort, site),
    [query, sort, site],
  );

  return (
    <>
      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search mods"
          aria-label="Search mods"
        />
        <div className="toolbar-row">
          <div className="tabs" role="tablist" aria-label="Sort">
            <button type="button" aria-pressed={sort === "popular"} onClick={() => setSort("popular")}>
              Popular
            </button>
            <button type="button" aria-pressed={sort === "recent"} onClick={() => setSort("recent")}>
              Recent
            </button>
          </div>
        </div>
        <div className="toolbar-row">
          <span className="toolbar-label" id="by-site-label">
            By site
          </span>
          <div className="chips" role="group" aria-labelledby="by-site-label">
            {SITE_CHIPS.map((host) => (
              <button
                key={host}
                type="button"
                aria-pressed={site === host}
                onClick={() => setSite(site === host ? null : host)}
              >
                {host}
              </button>
            ))}
          </div>
        </div>
      </div>
      {list.length === 0 ? (
        <p className="empty">No mods match that search.</p>
      ) : (
        <div className="grid">
          {list.map((mod) => (
            <Link key={mod.id} className="card" href={`/mods/${mod.id}`}>
              <ModShot hue={mod.screenshotHue} label={mod.screenshotLabel} scene={mod.screenshotScene} />
              <div className="card-meta">
                <h2>{mod.name}</h2>
                <p>
                  <span>{mod.site}</span>
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
