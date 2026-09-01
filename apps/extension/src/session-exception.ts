/** In-memory session exceptions. Cleared when the service worker dies. */

export interface SessionExceptionStore {
  mods: Record<string, string[]>;
  policies: Record<string, string[]>;
}

export function createSessionExceptionStore(): SessionExceptionStore {
  return { mods: {}, policies: {} };
}

export function clearSessionExceptionStore(
  store: SessionExceptionStore,
): void {
  store.mods = {};
  store.policies = {};
}

export function isSessionExcepted(
  bag: Readonly<Record<string, readonly string[]>> | undefined,
  id: string,
  origin: string,
): boolean {
  return (bag?.[id] ?? []).includes(origin);
}

export function setSessionOriginException(
  bag: Record<string, string[]>,
  id: string,
  origin: string,
  excepted: boolean,
): void {
  const selected = new Set(bag[id] ?? []);
  if (excepted) {
    selected.add(origin);
  } else {
    selected.delete(origin);
  }
  if (selected.size === 0) {
    delete bag[id];
    return;
  }
  bag[id] = [...selected];
}
