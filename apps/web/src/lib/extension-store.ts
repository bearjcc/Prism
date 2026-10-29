export const CHROME_STORE = "https://chromewebstore.google.com/";

export const GITHUB_RELEASES_URL = "https://github.com/bearjcc/Prism/releases";

/** Marketplace installs need extension builds that ship the signed catalogue verifier. */
export const MARKETPLACE_EXTENSION_VERSION = "0.1.2";

export function bundledEntryPath(packageId: string): string {
  const encoded = encodeURIComponent(packageId);
  return `bundled-mods/${encoded}/src/index.js`;
}
