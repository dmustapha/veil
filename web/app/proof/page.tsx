import { Eye, EyeOff, ExternalLink } from "lucide-react";
import { Nav } from "@/components/Nav";
import { SiteFooter } from "@/components/SiteFooter";
import { SealByteGrid } from "@/components/SealByteGrid";
import { DeployedContracts } from "@/components/DeployedContracts";
import { TrustFooter } from "@/components/TrustFooter";
import { CheatPlayground } from "@/components/app/CheatPlayground";
import { PROOF, DEPLOYED, POSITION } from "@/lib/constants";
import styles from "./proof.module.css";

export const metadata = {
  title: "Veil proof: what we trust, proven on-chain",
};

/** Public inputs the proof commits to. No amount, by design. */
const PUBLIC_ROWS = [
  {
    k: "Threshold",
    v: `≥ ${POSITION.thresholdEth}`,
    plain: true,
    help: "The public minimum you proved you cleared.",
  },
  {
    k: "Note commitment",
    v: "7530136…834832",
    mono: true,
    help: "The Poseidon2 commitment to your note, inserted into the pool tree.",
  },
  {
    k: "Nullifier",
    v: "one-time spend tag",
    plain: true,
    help: "Published when the note is spent, so the same note can never be spent twice.",
  },
  {
    k: "Axelar message",
    v: "0x6903…d7f9-3",
    mono: true,
    help: "The authenticated (commitment, amount) delivery that backed your note with real Sepolia WETH.",
  },
] as const;

const PRIVATE_ROWS = [
  {
    k: "Exact collateral amount",
    help: "How much you actually locked. Sealed in the witness, never transmitted.",
  },
  {
    k: "Ethereum address",
    help: "Which wallet holds it. Never written to Stellar, never on the ledger.",
  },
] as const;

export default function ProofPage() {
  return (
    <>
      <Nav />
      <main>
        {/* 1. HEADER */}
        <section className={`${styles.header} wrap`}>
          <div className="section-kicker reveal" data-d="1">
            Proof and on-chain verification
          </div>
          <h1 className="app-title reveal" data-d="2">
            Proof and on-chain verification.
          </h1>
          <p className="app-lead reveal" data-d="3">
            This is the evidence room. The real {PROOF.size} proof, the exact
            split between what Stellar sees and what stays hidden, the contracts
            that gate the money, and the trust model named in full. Every value
            below is read from a live testnet, not a screenshot.
          </p>
        </section>

        {/* 2. THE SEAL (centerpiece) */}
        <section className="section-pad wrap">
          <div className="section-head reveal">
            <div className="section-kicker">The proof</div>
            <h2 className="section-title">The proof, byte by byte.</h2>
            <p className="section-lead">
              This is the real {PROOF.system} proof Stellar verifies on its own.
              It is the three curve points {PROOF.layout}, generated in your
              browser. Stellar reads all {PROOF.size} and decides for itself.
            </p>
          </div>
          <div className={`${styles.sealStage} reveal`} data-d="2">
            <SealByteGrid state="locked" />
          </div>
          <p className={`${styles.sealCaption} reveal`} data-d="3">
            A real proof locks <b>lime</b>. A forged one is{" "}
            <b>rejected</b> and nothing moves. The lit bytes at the front mark
            where proof point <span className={styles.code}>A</span> begins; the
            rest are points B and C, all checked by one {PROOF.curve} pairing.
          </p>
        </section>

        {/* 3. THE JOURNAL: PUBLIC vs PRIVATE */}
        <section className="section-pad wrap">
          <div className="section-head reveal">
            <div className="section-kicker">Public inputs</div>
            <h2 className="section-title">What Stellar sees, and what it never sees.</h2>
            <p className="section-lead">
              The proof commits to a small set of public inputs and nothing more.
              Everything on the left is on-chain. Everything on the right stays
              inside the prover and is never sent anywhere.
            </p>
          </div>

          <div className={styles.journal}>
            <div className={`${styles.col} ${styles.colPublic} reveal`}>
              <div className={styles.colHead}>
                <span className={styles.colMark} aria-hidden="true">
                  <Eye />
                </span>
                <span>
                  <span className={styles.colTitle}>Public</span>
                  <span className={styles.colSub}>What Stellar sees</span>
                </span>
              </div>
              <div className={styles.rows}>
                {PUBLIC_ROWS.map((r) => (
                  <div className={styles.row} key={r.k}>
                    <div className={styles.rowTop}>
                      <span className={styles.rowK}>{r.k}</span>
                      <span
                        className={`${styles.rowV}${
                          "plain" in r && r.plain ? ` ${styles.plain}` : ""
                        }${"mono" in r && r.mono ? " mono" : ""}`}
                      >
                        {r.v}
                      </span>
                    </div>
                    <p className={styles.rowHelp}>{r.help}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className={`${styles.col} ${styles.colPrivate} reveal`} data-d="2">
              <div className={styles.colHead}>
                <span className={styles.colMark} aria-hidden="true">
                  <EyeOff />
                </span>
                <span>
                  <span className={styles.colTitle}>Private</span>
                  <span className={styles.colSub}>
                    Never leaves the prover, never on Stellar
                  </span>
                </span>
              </div>
              <div className={styles.rows}>
                {PRIVATE_ROWS.map((r) => (
                  <div className={styles.row} key={r.k}>
                    <div className={styles.rowTop}>
                      <span className={styles.rowK}>{r.k}</span>
                      <span
                        className={styles.redact}
                        role="img"
                        aria-label="hidden"
                      >
                        {"▓▓▓▓▓▓"}
                      </span>
                    </div>
                    <p className={styles.rowHelp}>{r.help}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className={`${styles.note} reveal`}>
            That gap is the privacy guarantee. Stellar can confirm you cleared
            the threshold and that this proof has never been used, without ever
            learning <b>how much you hold</b> or <b>which wallet is yours</b>.
            The lender, the ledger, and every observer see only the public
            journal.
          </p>
        </section>

        {/* 4. THE VERIFIER */}
        <section className="section-pad wrap">
          <div className="section-head reveal">
            <div className="section-kicker">The verifier</div>
            <h2 className="section-title">The contract that checks every proof.</h2>
            <p className="section-lead">
              A single Soroban contract on Stellar testnet does the verification.
              It is pinned to one circuit&apos;s verifying key, so it only accepts
              proofs produced by the exact circuit Veil published.
            </p>
          </div>

          <div className={`${styles.verifier} reveal`} data-d="2">
            <div className={styles.vfRow}>
              <span className={styles.vfK}>Circuit binding</span>
              <span className={`${styles.vfV} mono`}>borrow.circom → verifying key</span>
              <span className={styles.vfHelp}>
                The verifier embeds one fixed verifying key. Change the circuit
                and that key changes, so old proofs stop verifying.
              </span>
            </div>
            <div className={styles.vfRow}>
              <span className={styles.vfK}>Verifier contract</span>
              <span className={styles.vfValueRow}>
                <span className={`${styles.vfV} mono`}>
                  {DEPLOYED.verifier.addr}
                </span>
                <a
                  className={styles.vfLink}
                  href={DEPLOYED.verifier.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {DEPLOYED.verifier.explorer}{" "}
                  <ExternalLink aria-hidden="true" />
                </a>
              </span>
              <span className={styles.vfHelp}>
                The live Groth16 verifier on Stellar testnet. Open it on the
                explorer and read it yourself.
              </span>
            </div>
            <div className={styles.vfRow}>
              <span className={styles.vfK}>Proof system</span>
              <span className={styles.vfV}>{PROOF.system}</span>
              <span className={styles.vfHelp}>
                A succinct proof checked by one BN254 pairing inside the
                contract.
              </span>
            </div>
            <div className={styles.vfRow}>
              <span className={styles.vfK}>Proof size</span>
              <span className={`${styles.vfV} ${styles.lime}`}>
                {PROOF.size}
              </span>
              <span className={styles.vfHelp}>
                The whole proof is {PROOF.size}. That is all Stellar needs to be
                convinced.
              </span>
            </div>
          </div>
        </section>

        {/* 5. LIVE CHEAT-FAIL EXHIBIT */}
        <section className="section-pad wrap">
          <div className="section-head reveal">
            <div className="section-kicker">Try to cheat</div>
            <h2 className="section-title">Forge the proof, and no USDC moves.</h2>
            <p className="section-lead">
              This is not hypothetical. In Veil&apos;s live cross-chain run a borrow
              proof with a tampered public input was rejected on-chain with
              Error(Contract, #0) InvalidProof, and zero USDC moved. Replay it
              below and the proof shatters red. Re-spending an already-spent note
              is rejected too — its nullifier is already recorded. Either way the
              money stays put.
            </p>
          </div>
          <CheatPlayground />
        </section>

        {/* 6. DEPLOYED CONTRACTS + REAL TX LINKS */}
        <DeployedContracts />

        {/* 7. TRUST MODEL */}
        <TrustFooter />
      </main>
      <SiteFooter />
    </>
  );
}
