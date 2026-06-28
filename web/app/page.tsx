import Link from "next/link";
import {
  ArrowRight,
  Lock,
  Coins,
  Gauge,
  Unlock,
  Globe,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { FrostedVeil } from "@/components/FrostedVeil";
import { SealByteGrid } from "@/components/SealByteGrid";
import { POSITION, PROOF, SITE } from "@/lib/constants";
import styles from "./page.module.css";

const CAPABILITIES = [
  {
    Icon: Lock,
    title: "Open a private position",
    help: "Lock collateral on Ethereum and keep the amount to yourself.",
  },
  {
    Icon: Coins,
    title: "Borrow USDC",
    help: "Draw a loan on Stellar against collateral nobody can see.",
  },
  {
    Icon: Gauge,
    title: "Track your loan health",
    help: "Watch your borrow limit and balance update as you go.",
  },
  {
    Icon: Unlock,
    title: "Repay to unlock",
    help: "Pay the loan back and release your collateral on Ethereum.",
  },
  {
    Icon: Globe,
    title: "Use it anywhere on Stellar",
    help: "Your borrowed USDC works across the Stellar ecosystem.",
  },
];

const STEPS = [
  {
    Icon: Lock,
    num: "Step 1",
    name: "Lock collateral",
    desc: "Lock crypto on Ethereum (Sepolia). It never leaves the chain.",
  },
  {
    Icon: KeyRound,
    num: "Step 2",
    name: "Prove privately",
    desc: "A zero-knowledge proof shows you cleared the threshold, not the amount.",
  },
  {
    Icon: Coins,
    num: "Step 3",
    name: "Borrow USDC",
    desc: "Stellar checks the proof and releases the loan to your wallet.",
  },
  {
    Icon: Unlock,
    num: "Step 4",
    name: "Repay to unlock",
    desc: "Repay anytime and your collateral unlocks back on Ethereum.",
  },
];

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        {/* HERO (soft zone) */}
        <section className={`${styles.hero} wrap`}>
          <div className={`${styles.eyebrow} reveal`} data-d="1">
            <span className={styles.dot} aria-hidden="true" />
            Private borrowing across two chains
          </div>
          <h1 className={`${styles.title} reveal`} data-d="2">
            Borrow USDC.
            <br />
            Keep your balance <em>hidden</em>.
          </h1>
          <p className={`${styles.subhead} reveal`} data-d="3">
            Borrow USDC on Stellar against crypto you keep on Ethereum. A
            zero-knowledge proof shows you have enough collateral without
            revealing how much you hold or which wallet is yours.
          </p>
          <div className={`${styles.ctaRow} reveal`} data-d="4">
            <Link className="btn btn-primary" href="/app">
              Open the app <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="btn btn-ghost" href="/how-it-works">
              How it works
            </Link>
          </div>

          {/* the two signatures, as a showcase */}
          <div className={`${styles.showcase} reveal`} data-d="5">
            <div className={`${styles.show} ${styles.soft}`}>
              <div className={styles.showTag}>
                <span className={styles.mk} aria-hidden="true" />
                Your amount, hidden
              </div>
              <FrostedVeil />
              <p className={styles.showCap}>
                The exact collateral stays behind frosted glass. Only the public
                minimum, <b>at least {POSITION.thresholdEth}</b>, is ever shown.
              </p>
            </div>
            <div className={`${styles.show} ${styles.hard}`}>
              <div className={styles.showTag}>
                <span className={styles.mk} aria-hidden="true" />
                The proof that secures it
              </div>
              <SealByteGrid state="locked" />
              <p className={styles.showCap}>
                A cryptographic seal Stellar checks on its own. It starts{" "}
                <b>{PROOF.sealSelector}</b>. If it is real, the loan unlocks. If
                it is faked, nothing moves.
              </p>
            </div>
          </div>
        </section>

        {/* WHAT YOU CAN DO (soft zone) */}
        <section className={`${styles.band} wrap`}>
          <div className={`${styles.bandHead} reveal`}>
            <div className={styles.kicker}>What you can do</div>
            <h2 className={styles.bandTitle}>
              A real product, not a single trick.
            </h2>
            <p className={styles.bandLead}>
              Veil is a private borrowing app. Here is what it lets you do.
            </p>
          </div>
          <div className={`${styles.capGrid} reveal`} data-d="2">
            {CAPABILITIES.map(({ Icon, title, help }) => (
              <div key={title} className={styles.cap}>
                <span className={styles.capIcon}>
                  <Icon aria-hidden="true" />
                </span>
                <span className={styles.capTitle}>{title}</span>
                <span className={styles.capHelp}>{help}</span>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS + TRUST (hard / proof zone) */}
        <div className={styles.proofZone}>
          <section className={`${styles.band} wrap`}>
            <div className={`${styles.hardHead} reveal`}>
              <span className={styles.idx}>[ 01 ]</span>
              <h2 className={styles.hardTitle}>How it works</h2>
              <p className={styles.hardLead}>
                Four steps. Your collateral never bridges; a proof, not a
                relayer, is what Stellar trusts.
              </p>
            </div>
            <div className={`${styles.stepGrid} reveal`} data-d="2">
              {STEPS.map(({ Icon, num, name, desc }) => (
                <div key={num} className={styles.step}>
                  <span className={styles.stepIcon}>
                    <Icon aria-hidden="true" />
                  </span>
                  <span className={styles.stepNum}>{num}</span>
                  <span className={styles.stepName}>{name}</span>
                  <span className={styles.stepDesc}>{desc}</span>
                </div>
              ))}
            </div>
            <div className={`${styles.hardMore} reveal`}>
              <Link href="/how-it-works">
                See the full walkthrough <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </section>

          <section
            className={`${styles.band} wrap`}
            style={{ paddingTop: 0 }}
          >
            <div className={`${styles.trust} reveal`}>
              <div className={styles.trustText}>
                <span className={styles.trustIcon}>
                  <ShieldCheck aria-hidden="true" />
                </span>
                <span>
                  <span className={styles.trustLine}>
                    Veil is not trustless. We name exactly what you trust.
                  </span>
                  <span className={styles.trustSub}>
                    A price oracle, two testnets, and one prover. Read the
                    honest list before you rely on it.
                  </span>
                </span>
              </div>
              <div className={styles.hardMore}>
                <Link href="/proof">
                  What we trust <ArrowRight aria-hidden="true" />
                </Link>
              </div>
            </div>
          </section>
        </div>

        {/* FINAL CTA (soft zone) */}
        <section className={`${styles.final} wrap`}>
          <div className={`${styles.finalCard} reveal`}>
            <h2 className={styles.finalTitle}>
              Borrow USDC. <em>Keep it private.</em>
            </h2>
            <p className={styles.finalSub}>
              Open the app on {SITE.networks} and run the live demo. The
              collateral amount never appears.
            </p>
            <div className={styles.finalCta}>
              <Link className="btn btn-primary" href="/app">
                Open the app <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="btn btn-ghost" href="/how-it-works">
                How it works
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
