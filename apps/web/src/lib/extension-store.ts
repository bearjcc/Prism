export const CHROME_STORE = "https://chromewebstore.google.com/";

export function bundledEntryPath(packageId: string): string {
  const encoded = encodeURIComponent(packageId);
  return `bundled-mods/${encoded}/src/index.js`;
}
