import Link from "next/link";
import { HomeSteps } from "../components/home-steps";
import { HomeSurface } from "../components/home-surface";
import { ModShot } from "../components/mod-shot";
import { PrismScene } from "../components/prism-scene";
import { PrismMark } from "../components/wordmark";
import { CHROME_STORE } from "../lib/extension-store";
import { catalogue } from "../lib/catalogue";
import styles from "./home.module.css";

const spectrumTones = [
  styles.slabRed,
  styles.slabYellow,
  styles.slabGreen,
  styles.slabBlue,
  styles.slabMagenta,
];

export default function HomePage() {
  const mods = catalogue();

  return (
    <div className={styles.home} data-surface="home">
      <HomeSurface />

      <section className={styles.stage}>
        <div className={styles.hero}>
          <h1 className={styles.wordmark}>Prism</h1>
          <p className={styles.tagline}>See the web in a new light</p>
          <p className={styles.blurb}>
            Web mods that are secure by default. Reshape the sites you already use, and only
            enable the features you want.
          </p>
        </div>
        <HomeSteps />
        <PrismScene />
        <div className={styles.spectrumStrip} data-slabs aria-hidden="true">
          {spectrumTones.map((tone) => (
            <span key={tone} className={`${styles.spectrumBand} ${tone}`} />
          ))}
        </div>
      </section>

      <div className={styles.inner}>
        <section className={styles.narrative} aria-labelledby="mods-heading">
          <h2 id="mods-heading">Secure mods for sites you already use</h2>
          <p>
            First-party tracer mods reshape YouTube, Reddit cross-posts, and ad slots on pages you
            already open. Each listing shows declared capabilities before anything runs.
          </p>
          <ul className={styles.previewStrip}>
            {mods.map((mod) => (
              <li key={mod.id}>
                <Link href={`/mods/${mod.id}`} className={styles.previewLink}>
                  <ModShot src={mod.previewSrc} alt={mod.previewAlt} />
                  <span>{mod.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.narrative} aria-labelledby="deny-heading">
          <h2 id="deny-heading">Nothing runs until you allow it</h2>
          <p>
            Default deny. Optional capabilities stay off until you grant them in the popup. Explore
            lists every required and optional scope before install.
          </p>
        </section>

        <section className={styles.narrative} aria-labelledby="start-heading">
          <h2 id="start-heading">Install, enable, reshape</h2>
          <ol className={styles.startList}>
            <li>
              <a href={CHROME_STORE}>Install the Prism extension</a>
            </li>
            <li>
              <Link href="/explore">Enable a mod from Explore</Link>
            </li>
            <li>
              <Link href="/create">Publish your own package</Link>
            </li>
          </ol>
        </section>

        <footer className={styles.footer}>
          <PrismMark className={styles.footerMark} />
          <a href="https://github.com/bearjcc/Prism">Source</a>
          <Link href="/explore">Explore</Link>
          <Link href="/signin">Sign in</Link>
          <Link href="/about">About</Link>
        </footer>
      </div>
    </div>
  );
}
