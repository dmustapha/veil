import Link from "next/link";
import {
  Lock,
  KeyRound,
  BadgeCheck,
  Unlock,
  ArrowRight,
  ArrowLeft,
  ArrowLeftRight,
  EyeOff,
  Eye,
  Info,
  Cpu,
  ShieldCheck,
  FileCheck2,
  Coins,
  Gauge,
  Server,
  Clock,
  Landmark,
} from "lucide-react";
import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { FrostedVeil } from "@/components/FrostedVeil";
import { POSITION, PROOF } from "@/lib/constants";
import { HASHLOCK } from "@/lib/onchain";
import s from "./page.module.css";

/** Public hashlock, truncated for display (full value is on-chain on both legs). */
const HASHLOCK_DISPLAY = `${HASHLOCK.slice(0, 10)}…${HASHLOCK.slice(-8)}`;

export const metadata = {
  title: "How Veil works: private cross-chain borrowing, explained",
  description:
    "A plain-language walkthrough of Veil: lock collateral on Ethereum, prove privately with a zero-knowledge proof, and borrow USDC on Stellar without revealing your amount or wallet.",
};

const FLOW = [
  {
    tone: "soft" as const,
    Icon: Lock,
    chain: "eth" as const,
    chainLabel: "Ethereum",
    title: "Lock collateral on Ethereum",
    text: (
      <>
        You deposit crypto into an escrow on Ethereum. It stays there the whole
        time. <b>Nothing bridges</b>, so you never hand your funds to a wrapper
        or a custodian.
      </>
    ),
  },
  {
    tone: "hard" as const,
    Icon: KeyRound,
    chain: "off" as const,
    chainLabel: "Off-chain",
    title: "Prove it privately",
    text: (
      <>
        A zero-knowledge proof shows your locked amount clears the bar, without
        revealing the amount or your wallet. <b>The number stays secret</b>; only
        the proof travels onward.
      </>
    ),
  },
  {
    tone: "hard" as const,
    Icon: BadgeCheck,
    chain: "xlm" as const,
    chainLabel: "Stellar",
    title: "Stellar verifies and lends",
    text: (
      <>
        Stellar checks the proof on-chain and, if it holds, sends you real USDC.
        <b> The proof, not a relayer, is what releases the money</b>, and the
        amount never appears on Stellar.
      </>
    ),
  },
  {
    tone: "soft" as const,
    Icon: Unlock,
    chain: "eth" as const,
    chainLabel: "Ethereum",
    title: "Repay to unlock, or time out",
    text: (
      <>
        Repaying on Stellar reveals a secret that unlocks your Ethereum
        collateral. <b>If you walk away</b>, a timeout returns the collateral to
        the lender, enforced where the collateral lives.
      </>
    ),
  },
];

const PRIVATE = [
  {
    Icon: EyeOff,
    text: (
      <>
        <b>Your exact collateral amount.</b> It sits behind the veil and is never
        sent to Stellar.
      </>
    ),
  },
  {
    Icon: EyeOff,
    text: (
      <>
        <b>Your Ethereum wallet.</b> The address that holds your collateral never
        appears on the Stellar side.
      </>
    ),
  },
];

const PUBLIC = [
  {
    Icon: Gauge,
    text: (
      <>
        <b>A threshold floor.</b> Everyone sees only that you cleared{" "}
        <b>{"≥"} {POSITION.thresholdEth}</b>, never the figure above it.
      </>
    ),
  },
  {
    Icon: FileCheck2,
    text: (
      <>
        <b>The proof.</b> The 260-byte Groth16 seal that Stellar checks, opening
        with selector <span className="mono">{PROOF.sealSelector}</span>.
      </>
    ),
  },
  {
    Icon: Lock,
    text: (
      <>
        <b>A hashlock.</b> One public value{" "}
        <span className="mono">{HASHLOCK_DISPLAY}</span> that ties the Ethereum
        lock to the Stellar loan.
      </>
    ),
  },
];

const TRUST = [
  {
    Icon: Server,
    name: "The checkpoint poster",
    desc: (
      <>
        Someone relays Ethereum&apos;s state to Stellar so the proof can be
        checked against it. Replacing this with a ZK light client is named{" "}
        <span className="future">future work</span>.
      </>
    ),
  },
  {
    Icon: Gauge,
    name: "The price oracle",
    desc: (
      <>
        An Ethereum-side price feed decides, on default, whether the collateral
        is worth enough to liquidate.
      </>
    ),
  },
  {
    Icon: Landmark,
    name: "The loan-sizing oracle",
    desc: (
      <>
        Reflector supplies the ETH price used to size your loan at a
        conservative borrow limit.
      </>
    ),
  },
  {
    Icon: Clock,
    name: "The timeout",
    desc: (
      <>
        A deadline returns the collateral to the lender if a leg stalls. It is
        set so the loan term ends before it.
      </>
    ),
  },
  {
    Icon: Info,
    name: "Unaudited testnet code",
    desc: (
      <>
        The verifiers are unaudited and run on test networks. This is
        demo-grade, not production money.
      </>
    ),
  },
];

const TECH = [
  {
    Icon: Cpu,
    name: "RISC Zero zkVM",
    val: (
      <>
        The proof is generated in a zkVM that runs the collateral check as a real
        program, so the logic is auditable, not hand-rolled.
      </>
    ),
  },
  {
    Icon: ShieldCheck,
    name: "Groth16 on Soroban",
    val: (
      <>
        A {PROOF.system} proof, verified on-chain by Stellar using Protocol 25
        and 26 host functions.
      </>
    ),
  },
  {
    Icon: Coins,
    name: "Real Circle USDC",
    val: (
      <>
        The loan disburses genuine Circle testnet USDC, the same token standard
        used across Stellar.
      </>
    ),
  },
  {
    Icon: Gauge,
    name: "Reflector price feed",
    val: (
      <>
        A live on-chain oracle on Stellar supplies the ETH price that sizes your
        loan.
      </>
    ),
  },
  {
    Icon: Lock,
    name: "Sepolia escrow",
    val: (
      <>
        Your collateral is held by a contract on Ethereum Sepolia, where unlock
        and default are both enforced.
      </>
    ),
  },
  {
    Icon: KeyRound,
    name: "Proof-as-authorization",
    val: (
      <>
        A Soroban custom account whose <span className="mono">__check_auth</span>{" "}
        verifies the proof on-chain, so the proof itself is the signature.
        Native to Stellar; no EVM has this at the protocol level.
      </>
    ),
  },
];

function ChainTag({
  chain,
  label,
}: {
  chain: "eth" | "xlm" | "off";
  label: string;
}) {
  if (chain === "off") {
    return (
      <span className={s.chainTag}>
        <KeyRound aria-hidden="true" style={{ width: 12, height: 12 }} />
        {label}
      </span>
    );
  }
  return (
    <span className={s.chainTag}>
      <span className={`${s.glyph} ${chain === "eth" ? s.eth : s.xlm}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export default function HowItWorksPage() {
  return (
    <>
      <Nav />
      <main>
        {/* 1. HEADER (soft zone) */}
        <section className={`${s.hero} wrap`}>
          <div className={`${s.kicker} reveal`} data-d="1">
            <span className={s.dot} aria-hidden="true" />
            How it works
          </div>
          <h1 className={`${s.title} reveal`} data-d="2">
            How Veil works, in <em>plain language</em>.
          </h1>
          <p className={`${s.lead} reveal`} data-d="3">
            Veil lets you borrow USDC on Stellar against collateral you keep on
            Ethereum. A zero-knowledge proof carries the one fact a lender needs,
            that you have enough, <b>without ever revealing how much you hold or
            which wallet is yours</b>.
          </p>
        </section>

        {/* 2. THE CROSS-CHAIN FLOW (soft shell, soft/hard step zoning) */}
        <section className={`${s.band} wrap`}>
          <div className={`${s.head} reveal`}>
            <div className={s.headKicker}>The flow, end to end</div>
            <h2 className={s.headTitle}>Four steps across two chains.</h2>
            <p className={s.headLead}>
              Your money never bridges. It stays locked on Ethereum, and only a
              proof crosses to Stellar. Here is the whole path.
            </p>
          </div>

          {/* no-bridge banner: money stays, only the proof crosses */}
          <div className={`${s.bridge} reveal`} data-d="2">
            <div className={s.bridgeChain}>
              <span className={s.chip} aria-hidden="true">
                <Lock />
              </span>
              <span className={s.lab}>
                Collateral stays on Ethereum
                <span className={s.sub}>Locked in escrow, never wrapped</span>
              </span>
            </div>
            <div className={s.bridgeMid} aria-hidden="true">
              <ArrowLeftRight />
              <span>Only the proof crosses</span>
            </div>
            <div className={`${s.bridgeChain} ${s.proof}`}>
              <span className={s.chip} aria-hidden="true">
                <ShieldCheck />
              </span>
              <span className={s.lab}>
                The proof is checked on Stellar
                <span className={s.sub}>No bridge, no relayer holds funds</span>
              </span>
            </div>
          </div>

          <div className={s.steps}>
            {FLOW.map(({ tone, Icon, chain, chainLabel, title, text }, i) => (
              <article
                key={title}
                className={`${s.stepCard} ${tone === "soft" ? s.soft : s.hard} reveal`}
                data-d={`${i + 1}`}
              >
                <div className={s.stepTop}>
                  <span className={s.stepNum}>
                    <span className={s.nBadge}>{i + 1}</span>
                    Step {i + 1}
                  </span>
                  <ChainTag chain={chain} label={chainLabel} />
                </div>
                <span className={s.stepIcon} aria-hidden="true">
                  <Icon />
                </span>
                <h3 className={s.stepTitle}>{title}</h3>
                <p className={s.stepText}>{text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* 3. PRIVATE vs PUBLIC (soft zone, zoned cards) */}
        <section className={`${s.band} wrap`}>
          <div className={`${s.head} reveal`}>
            <div className={s.headKicker}>What stays private</div>
            <h2 className={s.headTitle}>What is hidden, and what is shown.</h2>
            <p className={s.headLead}>
              The point of Veil is the gap between these two columns. Stellar
              learns just enough to lend, and nothing more.
            </p>
          </div>

          <div className={s.contrast}>
            <div className={`${s.cCard} ${s.private} reveal`} data-d="1">
              <div className={s.cHead}>
                <span className={s.cIcon} aria-hidden="true">
                  <EyeOff />
                </span>
                <span>
                  <span className={s.cTitle}>Private</span>
                  <span className={s.cTag}>Behind the veil, never sent</span>
                </span>
              </div>
              <FrostedVeil />
              <ul className={s.cList}>
                {PRIVATE.map(({ Icon, text }, i) => (
                  <li key={i} className={s.cItem}>
                    <span className={s.mk} aria-hidden="true">
                      <Icon />
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={`${s.cCard} ${s.public} reveal`} data-d="2">
              <div className={s.cHead}>
                <span className={s.cIcon} aria-hidden="true">
                  <Eye />
                </span>
                <span>
                  <span className={s.cTitle}>Public</span>
                  <span className={s.cTag}>What the ledger and lender see</span>
                </span>
              </div>
              <ul className={s.cList}>
                {PUBLIC.map(({ Icon, text }, i) => (
                  <li key={i} className={s.cItem}>
                    <span className={s.mk} aria-hidden="true">
                      <Icon />
                    </span>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
              <p className={s.cWhy}>
                Why it matters: you can borrow <b>without doxxing your net worth</b>{" "}
                to a lender or to everyone reading the chain. They learn you are
                good for it, not how good for it you are.
              </p>
            </div>
          </div>
        </section>

        {/* 4 + 5. TRUST + TECH (hard / proof zone) */}
        <div className={s.proofZone}>
          {/* 4. WHAT IS TRUSTED */}
          <section className={`${s.band} wrap`}>
            <div className={`${s.hardHead} reveal`}>
              <span className={s.idx}>[ 01 ]</span>
              <h2 className={s.hardTitle}>What you actually trust</h2>
              <p className={s.hardLead}>
                Veil is not trustless, and pretending otherwise would be dishonest.
                Here is the full list, named on purpose.
              </p>
            </div>

            <div className={`${s.trustList} reveal`} data-d="2">
              {TRUST.map(({ Icon, name, desc }) => (
                <div key={name} className={s.trustItem}>
                  <span className={s.tMark} aria-hidden="true">
                    <Icon />
                  </span>
                  <div className={s.tBody}>
                    <div className={s.tName}>{name}</div>
                    <div className={s.tDesc}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <p className={`${s.trustNote} reveal`}>
              <Info aria-hidden="true" />
              <span>
                Naming what we trust is the credibility move. The privacy itself
                holds no matter how the Ethereum state reaches Stellar, and the
                collateral is always enforced on Ethereum, where it lives.
              </span>
            </p>
          </section>

          {/* 5. THE TECH, BRIEFLY */}
          <section className={`${s.band} wrap`} style={{ paddingTop: 0 }}>
            <div className={`${s.hardHead} reveal`}>
              <span className={s.idx}>[ 02 ]</span>
              <h2 className={s.hardTitle}>The tech, briefly</h2>
              <p className={s.hardLead}>
                Five real pieces, each doing one job. The evidence for all of them
                lives on the proof page.
              </p>
            </div>

            <div className={`${s.techList} reveal`} data-d="2">
              {TECH.map(({ Icon, name, val }) => (
                <div key={name} className={s.techRow}>
                  <div className={s.techKey}>
                    <span className={s.tkIcon} aria-hidden="true">
                      <Icon />
                    </span>
                    <span className={s.tkName}>{name}</span>
                  </div>
                  <div className={s.techVal}>{val}</div>
                </div>
              ))}
            </div>

            <div className={`${s.techLinks} reveal`}>
              <Link href="/proof">
                See the proof and contracts <ArrowRight aria-hidden="true" />
              </Link>
              <Link href="/app">
                Try it in the app <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </section>
        </div>

        {/* CLOSING (soft zone) */}
        <section className={`${s.final} wrap`}>
          <div className={`${s.finalCard} reveal`}>
            <h2 className={s.finalTitle}>
              Now <em>see it run</em>.
            </h2>
            <p className={s.finalSub}>
              Open the app and walk the same four steps live. The collateral
              amount never appears, by design.
            </p>
            <div className={s.finalCta}>
              <Link className="btn btn-primary" href="/app">
                Open the app <ArrowRight aria-hidden="true" />
              </Link>
              <Link className="btn btn-ghost" href="/proof">
                What we trust
              </Link>
            </div>
            <Link className={s.backLink} href="/">
              <ArrowLeft aria-hidden="true" /> Back home
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
