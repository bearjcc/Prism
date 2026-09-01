import Link from "next/link";
import { HomeSteps } from "../components/home-steps";
import { HomeSurface } from "../components/home-surface";
import { PrismScene } from "../components/prism-scene";
import { PrismMark } from "../components/wordmark";
import styles from "./home.module.css";

const reasons = [
  {
    tone: styles.slabRed,
    title: "You stay in control",
    line: "Nothing runs until you say so.",
  },
  {
    tone: styles.slabYellow,
    title: "Sites you already use",
    line: "Mods for YouTube, Reddit, and the rest of your tab bar.",
  },
  {
    tone: styles.slabGreen,
    title: "Only what you enable",
    line: "Optional capabilities stay off until you turn them on.",
  },
  {
    tone: styles.slabBlue,
    title: "Secure by default",
    line: "Default deny. The listing shows what a mod can access.",
  },
  {
    tone: styles.slabMagenta,
    title: "Make or take",
    line: "Publish your own, or install from the commons. UserCSS in. Userscripts get translated.",
  },
];

export default function HomePage() {
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
        <section className={styles.slabs} data-slabs aria-label="Why Prism">
          {reasons.map((reason) => (
            <article key={reason.title} className={`${styles.slab} ${reason.tone}`}>
              <h2>{reason.title}</h2>
              <p>{reason.line}</p>
            </article>
          ))}
        </section>
      </section>

      <div className={styles.inner}>
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
