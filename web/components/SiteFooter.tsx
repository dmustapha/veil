import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { COPY, SITE } from "@/lib/constants";
import { BrandMark } from "@/components/BrandMark";
import styles from "./SiteFooter.module.css";

const liveLabel = SITE.live.replace(/^https?:\/\//, "");

export function SiteFooter() {
  return (
    <footer className={styles.foot}>
      <div className={styles.brand}>
        <BrandMark />
        {COPY.wordmark}
      </div>
      <nav className={styles.links} aria-label="Footer">
        <Link className={styles.link} href="/app">
          App
        </Link>
        <Link className={styles.link} href="/proof">
          Proof
        </Link>
        <Link className={styles.link} href="/how-it-works">
          How it works
        </Link>
      </nav>
      <div className={styles.meta}>
        <span>{SITE.networks}</span>
        <span>{COPY.track}</span>
        <a
          className={styles.live}
          href={SITE.live}
          target="_blank"
          rel="noreferrer"
        >
          {liveLabel} <ExternalLink aria-hidden="true" />
        </a>
      </div>
    </footer>
  );
}
