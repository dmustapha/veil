import { EyeOff, ShieldCheck } from "lucide-react";
import { POSITION } from "@/lib/constants";
import styles from "./PrivacyLedger.module.css";

/** Five redaction blocks standing in for a hidden value. */
function Hidden() {
  return (
    <span className={styles.hidden} aria-label="hidden">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} aria-hidden="true" />
      ))}
    </span>
  );
}

/**
 * "What Stellar sees" — the same loan two ways. Left: what a naive cross-chain loan would have to
 * publish on Stellar (the amount + your Ethereum wallet, public forever). Right: what Veil's proof
 * actually records (only the threshold, hashlock, nullifier, and your Stellar address). This is the
 * privacy made legible — shown as a positive artifact, not just absence.
 */
export function PrivacyLedger() {
  return (
    <div className={styles.grid}>
      <div className={`${styles.col} ${styles.exposed}`}>
        <span className={styles.tag}>
          <span className={styles.dot} aria-hidden="true" />
          <EyeOff size={14} aria-hidden="true" /> Without ZK
        </span>
        <p className={styles.sub}>A naive cross-chain loan must put your collateral in the clear so Stellar can check it.</p>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.k}>Collateral amount</span>
            <span className={`${styles.v} ${styles.leak}`}>0.01 ETH (exact)</span>
          </div>
          <div className={styles.row}>
            <span className={styles.k}>Your Ethereum wallet</span>
            <span className={`${styles.v} ${styles.leak}`}>0xe917…0Caf</span>
          </div>
          <div className={styles.row}>
            <span className={styles.k}>Recorded on Stellar</span>
            <span className={`${styles.v} ${styles.leak}`}>both, forever</span>
          </div>
        </div>
        <p className={styles.foot}>→ your net worth and identity, public and linked across two chains.</p>
      </div>

      <div className={`${styles.col} ${styles.shielded}`}>
        <span className={styles.tag}>
          <span className={styles.dot} aria-hidden="true" />
          <ShieldCheck size={14} aria-hidden="true" /> With Veil
        </span>
        <p className={styles.sub}>The proof attests the collateral clears the bar — the amount and wallet never leave the prover.</p>
        <div className={styles.rows}>
          <div className={styles.row}>
            <span className={styles.k}>Collateral amount</span>
            <span className={`${styles.v} ${styles.ok}`}>
              <Hidden /> &nbsp;≥ {POSITION.thresholdEth}
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.k}>Your Ethereum wallet</span>
            <span className={`${styles.v} ${styles.ok}`}>
              <Hidden />
            </span>
          </div>
          <div className={styles.row}>
            <span className={styles.k}>Recorded on Stellar</span>
            <span className={`${styles.v} ${styles.ok}`}>threshold, hashlock, nullifier, proof</span>
          </div>
        </div>
        <p className={styles.foot}>→ Stellar learns only “they cleared {POSITION.thresholdEth}.” Nothing about how much, or who.</p>
      </div>
    </div>
  );
}
