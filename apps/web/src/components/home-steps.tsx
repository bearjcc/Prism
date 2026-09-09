import Link from "next/link";
import { InstallControl } from "./install-control";
import styles from "../app/home.module.css";

export function HomeSteps() {
  return (
    <nav className={styles.steps} aria-label="Get started">
      <InstallControl className={`${styles.step} ${styles.stepPrimary}`} labelInstall="Install" />
      <Link className={`${styles.step} ${styles.stepSecondary}`} href="/explore">
        Enable a mod
      </Link>
      <Link className={`${styles.step} ${styles.stepSecondary}`} href="/explore">
        Explore
      </Link>
    </nav>
  );
}
