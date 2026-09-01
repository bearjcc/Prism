import type { Metadata } from "next";
import { SiteShell } from "../../components/site-shell";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <SiteShell current="about">
      <div className="page-head">
        <h1>About</h1>
      </div>
      <div className="stack">
        <p>The app is free to run. The source stays public, including if someone hosts a modified copy.</p>
        <p>
          Prism first-party code is AGPL-3.0-only. Community mods keep their own licence in the package. The
          registry requires a licence field; it does not force AGPL on mods.
        </p>
        <p>
          Use it for nothing. Pay only if you want Prism to sync for you. Subscriptions are hosted
          convenience, not extra safety. Donations buy an optional badge with no product power.
        </p>
        <p id="get-the-extension">
          Get the extension: Chromium unpacked load from this repository until a Chrome Web Store listing
          exists. Firefox as a store listing is not shipped yet.
        </p>
        <p>
          Stylus and UserStyles.world UserCSS can come across after sanitise. Violentmonkey-style
          userscripts have to be translated so they cannot grab the page.
        </p>
      </div>
    </SiteShell>
  );
}
