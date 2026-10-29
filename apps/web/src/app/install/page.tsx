import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";
import { SiteShell } from "../../components/site-shell";
import { InstallPageEnhance } from "../../components/install-page-enhance";
import { browserFamilyLabel, detectBrowserFromUserAgent } from "../../lib/browser-detect";
import {
  FIREFOX_ANDROID_GUIDANCE_URL,
  FIREFOX_ANDROID_INSTALL_HELP_URL,
  GITHUB_RELEASES_URL,
} from "../../lib/extension-store";
import {
  EXTENSION_RELEASE_ASSETS,
  fetchLatestExtensionRelease,
  findReleaseAsset,
  firefoxSignedInstallAvailable,
  formatReleaseDate,
  type ExtensionReleaseInfo,
} from "../../lib/github-extension-release";
import styles from "./install.module.css";

export const metadata: Metadata = {
  title: "Install extension",
  description: "Download and install the Prism browser extension (early alpha).",
};

export const revalidate = 600;

const FIREFOX_ONE_CLICK_PATH = "/api/extension-download/firefox";

function releaseMetaBlock(release: ExtensionReleaseInfo | null) {
  if (release === null) {
    return (
      <p className="install-alpha">
        Early alpha. Prism is not on the Chrome Web Store or AMO yet. Release metadata is
        temporarily unavailable; see{" "}
        <a href={GITHUB_RELEASES_URL}>GitHub releases</a>.
      </p>
    );
  }

  return (
    <>
      <p className="install-meta">
        Latest release: <strong>v{release.version}</strong> ({formatReleaseDate(release.publishedAt)}{" "}
        UTC).{" "}
        <a href={release.htmlUrl}>Release notes</a>
      </p>
      <p className="install-alpha">
        Early alpha. Builds are unsigned on Chromium (load unpacked) and may require temporary or
        developer installs on Firefox until AMO unlisted signing is configured in CI.
      </p>
    </>
  );
}

export default async function InstallPage() {
  const headerList = await headers();
  const primaryBrowser = detectBrowserFromUserAgent(headerList.get("user-agent") ?? "");

  let release: ExtensionReleaseInfo | null = null;
  try {
    release = await fetchLatestExtensionRelease({
      token: process.env.GITHUB_TOKEN,
    });
  } catch {
    release = null;
  }

  const chromiumZip = release
    ? findReleaseAsset(release, EXTENSION_RELEASE_ASSETS.chromiumZip)
    : undefined;
  const chromiumCrx = release ? findReleaseAsset(release, EXTENSION_RELEASE_ASSETS.chromiumCrx) : undefined;
  const firefoxZip = release
    ? findReleaseAsset(release, EXTENSION_RELEASE_ASSETS.firefoxZip)
    : undefined;
  const firefoxXpi = release ? findReleaseAsset(release, EXTENSION_RELEASE_ASSETS.firefoxXpi) : undefined;
  const signedFirefox = release !== null && firefoxSignedInstallAvailable(release);

  return (
    <SiteShell current="install">
      <InstallPageEnhance primaryBrowser={primaryBrowser} />
      <div className="page-head">
        <h1>Install Prism</h1>
        <p>
          Detected {browserFamilyLabel(primaryBrowser)} from your browser headers. Every option below
          stays visible with JavaScript off; scripts only refine ordering.
        </p>
      </div>

      {releaseMetaBlock(release)}

      <div
        className={styles.options}
        data-primary-browser={primaryBrowser}
        id="install-options"
      >
        <section
          className={styles.panel}
          data-browser="chromium"
          aria-labelledby="install-chromium-heading"
        >
          <h2 id="install-chromium-heading">Chrome, Edge, and other Chromium browsers</h2>
          <p>
            Windows and macOS block one-click <code>.crx</code> installs from the open web (
            <code>CRX_REQUIRED_PROOF_MISSING</code>). Use the unpacked zip and load the folder.
          </p>
          <ol className="install-steps">
            <li>
              <strong>Download</strong>
              <span>
                {chromiumZip ? (
                  <a href={chromiumZip.downloadUrl}>prism-chromium-unpacked.zip</a>
                ) : (
                  <a href={GITHUB_RELEASES_URL}>prism-chromium-unpacked.zip</a>
                )}{" "}
                from the latest GitHub release and unzip it.
              </span>
            </li>
            <li>
              <strong>Open extensions</strong>
              <span>
                Visit <code>chrome://extensions</code> (Chrome) or <code>edge://extensions</code>{" "}
                (Edge).
              </span>
            </li>
            <li>
              <strong>Developer mode</strong>
              <span>
                Turn on Developer mode. Chromium shows a warning that unpacked extensions can be
                risky.
              </span>
            </li>
            <li>
              <strong>Load unpacked</strong>
              <span>
                Click Load unpacked and choose the extracted folder (the one containing
                manifest.json).
              </span>
            </li>
          </ol>
          {chromiumCrx ? (
            <p className={styles.secondary}>
              Secondary:{" "}
              <a href={chromiumCrx.downloadUrl}>prism-chromium.crx</a> (Linux or managed Chrome
              only; not supported on Windows or macOS).
            </p>
          ) : null}
        </section>

        <section
          className={styles.panel}
          data-browser="firefox"
          aria-labelledby="install-firefox-heading"
        >
          <h2 id="install-firefox-heading">Firefox (desktop)</h2>
          {signedFirefox ? (
            <>
              <p>
                This release includes an AMO-signed unlisted build. Use one-click install (served as{" "}
                <code>application/x-xpinstall</code>):
              </p>
              <p>
                <a className="btn btn-solid" href={FIREFOX_ONE_CLICK_PATH}>
                  Install Prism for Firefox
                </a>
              </p>
            </>
          ) : (
            <>
              <p>
                Release Firefox only keeps unsigned add-ons until you restart. Use a temporary install
                or Firefox Developer Edition / Nightly with signature checks relaxed.
              </p>
              <ol className="install-steps">
                <li>
                  <strong>Download</strong>
                  <span>
                    {firefoxZip ? (
                      <a href={firefoxZip.downloadUrl}>prism-firefox-unpacked.zip</a>
                    ) : (
                      <a href={GITHUB_RELEASES_URL}>prism-firefox-unpacked.zip</a>
                    )}{" "}
                    and unzip, or grab{" "}
                    {firefoxXpi ? (
                      <a href={firefoxXpi.downloadUrl}>prism-firefox.xpi</a>
                    ) : (
                      <code>prism-firefox.xpi</code>
                    )}
                    .
                  </span>
                </li>
                <li>
                  <strong>Temporary add-on</strong>
                  <span>
                    Open <code>about:debugging#/runtime/this-firefox</code>, click Load Temporary
                    Add-on, and choose <code>manifest.json</code> inside the folder.
                  </span>
                </li>
                <li>
                  <strong>Longer-lived sideload</strong>
                  <span>
                    On Firefox Developer Edition or Nightly, set{" "}
                    <code>xpinstall.signatures.required</code> to <code>false</code> in{" "}
                    <code>about:config</code>, then install the <code>.xpi</code>.
                  </span>
                </li>
              </ol>
            </>
          )}
        </section>

        <section
          className={styles.panel}
          data-browser="firefox-android"
          aria-labelledby="install-firefox-android-heading"
        >
          <h2 id="install-firefox-android-heading">Firefox for Android</h2>
          <p>
            Prism targets Firefox for Android 142+. Install through Mozilla&apos;s Android add-on flow
            when a signed build is available, then configure mods in Prism settings.
          </p>
          <ul className={styles.linkList}>
            <li>
              <a href={FIREFOX_ANDROID_INSTALL_HELP_URL}>
                Find and install add-ons on Firefox for Android
              </a>
            </li>
            <li>
              <a href={FIREFOX_ANDROID_GUIDANCE_URL}>
                Touch upload chip and Firefox for Android behaviour (Immich mod README)
              </a>
            </li>
          </ul>
        </section>

        <section className={styles.panel} data-browser="other" aria-labelledby="install-other-heading">
          <h2 id="install-other-heading">Other browsers</h2>
          <p>
            Pick Chromium or Firefox instructions above. Source and release assets live on{" "}
            <a href={GITHUB_RELEASES_URL}>GitHub</a>.
          </p>
        </section>
      </div>

      <p className={styles.back}>
        <Link href="/explore">Back to Explore</Link>
      </p>
    </SiteShell>
  );
}
