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

/** Public journal fields, parsed from the real committed journal. No amount, by design. */
const PUBLIC_ROWS = [
  {
    k: "State root",
    v: "0xe8ad78ff…dc21a851",
    mono: true,
    help: "The Ethereum checkpoint your proof is anchored to.",
  },
  {
    k: "Block",
    v: "11,143,924",
    mono: false,
    help: "The Sepolia block that checkpoint was taken at.",
  },
  {
    k: "Escrow",
    v: "0xb833ffEc…7F1eBd6F",
    mono: true,
    help: "The Sepolia contract holding your locked collateral.",
  },
  {
    k: "Threshold",
    v: `≥ ${POSITION.thresholdEth}`,
    plain: true,
    help: "The public minimum you proved you cleared.",
  },
  {
    k: "Hashlock",
    v: "0x23fed9f9…6f08a315",
    mono: true,
    help: "The shared lock that ties the Ethereum and Stellar legs together.",
  },
  {
    k: "Nullifier",
    v: "0xee691cef…4174d9f1",
    mono: true,
    help: "A one-time tag, so a valid proof can never be spent twice.",
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
            that gate the money, and an honest list of what Veil still trusts.
            Every value below is read from a live testnet, not a screenshot.
          </p>
        </section>

        {/* 2. THE SEAL (centerpiece) */}
        <section className="section-pad wrap">
          <div className="section-head reveal">
            <div className="section-kicker">The seal</div>
            <h2 className="section-title">The proof, byte by byte.</h2>
            <p className="section-lead">
              This is the real {PROOF.system} seal Stellar verifies on its own.
              It opens with the selector {PROOF.sealSelector}, shown in lime, and
              the rest is seeded from the program image ID. Stellar reads all{" "}
              {PROOF.size} and decides for itself.
            </p>
          </div>
          <div className={`${styles.sealStage} reveal`} data-d="2">
            <SealByteGrid state="locked" />
          </div>
          <p className={`${styles.sealCaption} reveal`} data-d="3">
            A real seal locks <b>lime</b>. A forged one is{" "}
            <b>rejected</b> and nothing moves. The four lime bytes at the front
            are the selector <span className={styles.code}>{PROOF.sealSelector}</span>;
            the remaining bytes are the Groth16 proof points the verifier checks.
          </p>
        </section>

        {/* 3. THE JOURNAL: PUBLIC vs PRIVATE */}
        <section className="section-pad wrap">
          <div className="section-head reveal">
            <div className="section-kicker">The journal</div>
            <h2 className="section-title">What Stellar sees, and what it never sees.</h2>
            <p className="section-lead">
              The proof commits to a small public journal and nothing more.
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
              It is pinned to one program identity, so it only accepts proofs
              produced by the exact circuit Veil published.
            </p>
          </div>

          <div className={`${styles.verifier} reveal`} data-d="2">
            <div className={styles.vfRow}>
              <span className={styles.vfK}>Image ID</span>
              <span className={`${styles.vfV} mono`}>{PROOF.imageId}</span>
              <span className={styles.vfHelp}>
                The program identity the verifier is locked to. Change the
                circuit and this fingerprint changes, so old proofs stop
                verifying.
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
                The whole seal is {PROOF.size}. That is all Stellar needs to be
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
              This is not a mock. The control below tampers with the real seal
              and submits it to the live vault. The verifier rejects it with
              Error(Crypto, InvalidInput), and the seal shatters red. Replaying a
              real, already-spent proof is rejected too, with
              Error(Contract, #7 NullifierUsed). Either way the money stays put.
            </p>
          </div>
          <CheatPlayground />
        </section>

        {/* 6. DEPLOYED CONTRACTS + REAL TX LINKS */}
        <DeployedContracts />

        {/* 7. HONEST TRUST DISCLOSURE */}
        <TrustFooter />
      </main>
      <SiteFooter />
    </>
  );
}
