import Link from "next/link";
import { InstallControl } from "./install-control";
import styles from "../app/home.module.css";

function ChalkNumeral({ n }: { n: 1 | 2 | 3 }) {
  const d =
    n === 1
      ? "M13.4 3.2c-.8 3.1-2.8 6.2-6.2 8.4M6.8 11.8h11.1M12.8 11.4c.15 7 .05 13.8.45 20.8"
      : n === 2
        ? "M6.2 9.4C7.2 4.6 15.4 3.6 16.4 8.8c.9 4.8-8.2 8-9 13.2-.25 1.6 8.4.7 12.2 1.8"
        : "M6.8 8.6c1.4-4.1 9.6-4.6 9.8.5.15 3.5-5.1 3.9-5.1 3.9 5.6-.3 8.8 3.4 6.8 7.5-2 4.2-10.4 3.7-11.8-.5";

  return (
    <svg className={styles.chalk} viewBox="0 0 24 36" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StepArrow() {
  return (
    <svg className={styles.stepArrow} viewBox="0 0 32 40" aria-hidden="true">
      <path
        d="M16.2 1.2c.6 7.2-3.2 11.4.2 18.2 2.8 5.6 1.1 10-.8 16.4M10.4 29.6c2 2.5 3.9 6.1 4.8 8.2 1.9-4 5.1-6.8 7.6-8.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HomeSteps() {
  return (
    <ol className={styles.steps}>
      <li>
        <ChalkNumeral n={1} />
        <InstallControl className={styles.step} labelInstall="Get the extension" />
        <StepArrow />
      </li>
      <li>
        <ChalkNumeral n={2} />
        <Link className={styles.step} href="/explore">
          Enable a mod
        </Link>
        <StepArrow />
      </li>
      <li>
        <ChalkNumeral n={3} />
        <Link className={styles.step} href="/create">
          Make your own
        </Link>
      </li>
    </ol>
  );
}
