"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, AppWindow, ShieldCheck, BookOpen } from "lucide-react";
import { COPY } from "@/lib/constants";
import { BrandMark } from "@/components/BrandMark";
import styles from "./Nav.module.css";

const LINKS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/app", label: "App", Icon: AppWindow },
  { href: "/proof", label: "Proof", Icon: ShieldCheck },
  { href: "/how-it-works", label: "How it works", Icon: BookOpen },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className={`${styles.nav} reveal`} data-d="1">
      <Link href="/" className={styles.brand} aria-label={`${COPY.wordmark} home`}>
        <BrandMark />
        <span className={styles.brandName}>{COPY.wordmark}</span>
      </Link>
      <nav className={styles.meta} aria-label="Primary">
        {LINKS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`${styles.link}${active ? ` ${styles.active}` : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          );
        })}
        <span className={styles.pill}>{COPY.track}</span>
      </nav>
    </header>
  );
}
