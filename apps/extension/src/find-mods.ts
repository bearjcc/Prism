export const PRISM_CATALOGUE_ORIGIN = "http://localhost:3000";

export function findModsSearchQuery(hostname: string): string {
  return hostname.replace(/^www\./u, "");
}

export function findModsExploreUrl(
  hostname: string,
  catalogueOrigin: string = PRISM_CATALOGUE_ORIGIN,
): string {
  const url = new URL("/explore", catalogueOrigin);
  url.searchParams.set("q", findModsSearchQuery(hostname));
  return url.href;
}

export function findModsLabel(hostname: string): string {
  return `Find mods for ${findModsSearchQuery(hostname)}`;
}
