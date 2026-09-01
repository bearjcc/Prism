import { matchesAnyScope } from "./loader.js";

export interface PopupModLike {
  readonly manifest: {
    readonly id: string;
    readonly scopes: readonly string[];
  };
  readonly enabled: boolean;
}

export function partitionModsForPage<T extends PopupModLike>(
  mods: readonly T[],
  pageUrl: string | undefined,
): { readonly matching: readonly T[]; readonly other: readonly T[] } {
  if (pageUrl === undefined || !/^https?:/u.test(pageUrl)) {
    return { matching: [], other: mods };
  }
  const matching: T[] = [];
  const other: T[] = [];
  for (const mod of mods) {
    if (matchesAnyScope(mod.manifest.scopes, pageUrl)) {
      matching.push(mod);
    } else {
      other.push(mod);
    }
  }
  return { matching, other };
}

export function describePinHint(): string {
  return "Pin Prism from the extensions menu so this panel is one click away.";
}

export function describeFindMods(): string {
  return "Opens Explore with a search for this host. Prism does not send the site you are on until you click.";
}
