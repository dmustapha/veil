import Link from "next/link";
import {
  Lock,
  KeyRound,
  BadgeCheck,
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
import s from "./page.module.css";

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
        You wrap ETH into WETH and lock it in a Veil contract on Ethereum, bound
        to a private note. It stays there the whole time. <b>Nothing bridges</b>,
        so you never hand your funds to a custodian.
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
        A zero-knowledge proof, generated <b>in your browser</b>, shows your
        locked amount clears the bar without revealing the amount or your wallet.
        The witness never leaves your device; only the proof travels onward.
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
    Icon: Coins,
    chain: "xlm" as const,
    chainLabel: "Stellar",
    title: "Spend your USDC; collateral stays put",
    text: (
      <>
        Your borrowed USDC is real Circle USDC you can use across Stellar. Your
        WETH stays locked on Ethereum, backing the loan — it never bridges.{" "}
        Repay on Stellar and the pool releases your WETH back to your Ethereum
        address, verified by a shielded release proof.{" "}
        <span className="future">The shielded WETH pool and liquidation-release</span> are the next milestone.
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
        <b>The proof.</b> The {PROOF.size} {PROOF.system} proof that Stellar
        checks on its own, the three curve points{" "}
        <span className="mono">{PROOF.layout}</span>.
      </>
    ),
  },
  {
    Icon: Lock,
    text: (
      <>
        <b>A note commitment.</b> One public value that ties your Ethereum lock
        to the Stellar loan, revealing nothing about the amount behind it.
      </>
    ),
  },
];

const TRUST = [
  {
    Icon: Server,
    name: "Axelar's validator set",
    desc: (
      <>
        The attestation that your ETH is really locked crosses to Stellar over{" "}
        Axelar&apos;s decentralized validator set, authenticated on-chain by the
        Axelar gateway. Veil runs <b>no relayer of its own</b>.
      </>
    ),
  },
  {
    Icon: Gauge,
    name: "The price oracle",
    desc: (
      <>
        Reflector, a live oracle on Stellar, supplies the ETH price the vault
        uses to size your loan and decide liquidation.
      </>
    ),
  },
  {
    Icon: Landmark,
    name: "The one-time pin",
    desc: (
      <>
        An admin pins the pool to the Ethereum lock contract once, after seeing
        Axelar&apos;s first message. Until then the pool is <b>fail-closed</b>.
      </>
    ),
  },
  {
    Icon: Clock,
    name: "The loan term",
    desc: (
      <>
        The vault carries a loan term and liquidation threshold. Repay-to-release
        is live; wiring default-to-claim enforcement into the shielded WETH pool
        is the <span className="future">next milestone</span>.
      </>
    ),
  },
  {
    Icon: Info,
    name: "Unaudited testnet code",
    desc: (
      <>
        The contracts are unaudited and run on test networks. This is demo-grade,
        not production money.
      </>
    ),
  },
];

const TECH = [
  {
    Icon: Cpu,
    name: "Circom + Groth16",
    val: (
      <>
        The collateral check is a Circom circuit, proven with Groth16 by snarkjs{" "}
        <b>in your browser</b> in about a second. The witness never leaves the
        device.
      </>
    ),
  },
  {
    Icon: ShieldCheck,
    name: "Groth16 on Soroban",
    val: (
      <>
        A {PROOF.system} proof, verified natively on-chain by Stellar using
        Protocol 27 BN254 host functions.
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
    name: "Sepolia WETH lock",
    val: (
      <>
        Real WETH is locked in a Veil contract on Ethereum Sepolia, where the
        deposit opening proof is verified on-chain before anything crosses.
      </>
    ),
  },
  {
    Icon: KeyRound,
    name: "Axelar GMP",
    val: (
      <>
        The (commitment, amount) attestation crosses via Axelar General Message
        Passing, authenticated by the Soroban gateway — no trusted relayer.
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
                <span className={s.sub}>Locked on Ethereum, never bridged</span>
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
              <h2 className={s.hardTitle}>The trust model, in full</h2>
              <p className={s.hardLead}>
                Every trust boundary is named on purpose. The proof is
                cryptographic; these are the components around it, each doing
                exactly one job.
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
