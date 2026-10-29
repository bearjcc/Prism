/** Direct install page while Chrome Web Store and AMO listings are not live. */
export const EXTENSION_INSTALL_PATH = "/install";

export const EXTENSION_INSTALL_URL = EXTENSION_INSTALL_PATH;

/** Legacy placeholder; public CTAs use {@link EXTENSION_INSTALL_PATH}. */
export const CHROME_STORE = EXTENSION_INSTALL_PATH;

export const GITHUB_RELEASES_URL = "https://github.com/bearjcc/Prism/releases";

export const FIREFOX_ANDROID_GUIDANCE_URL =
  "https://github.com/bearjcc/Prism/blob/master/mods/immich-upload/README.md#firefox-for-android-and-other-touch-browsers";

export const FIREFOX_ANDROID_INSTALL_HELP_URL =
  "https://support.mozilla.org/kb/find-and-install-add-ons-firefox-android";

/** Marketplace installs need extension builds that ship the signed catalogue verifier. */
export const MARKETPLACE_EXTENSION_VERSION = "0.1.2";

export function bundledEntryPath(packageId: string): string {
  const encoded = encodeURIComponent(packageId);
  return `bundled-mods/${encoded}/src/index.js`;
}
