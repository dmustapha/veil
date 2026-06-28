import { EyeOff, Lock } from "lucide-react";
import { POSITION } from "@/lib/constants";
import styles from "./FrostedVeil.module.css";

/**
 * Signature 1: the frosted veil. The exact collateral amount sits behind
 * real frosted glass and is NEVER rendered: only redaction blocks and the
 * public threshold (>= 0.005 ETH) are ever shown. Privacy invariant.
 */
export function FrostedVeil({ className }: { className?: string }) {
  return (
    <div className={`${styles.veil}${className ? ` ${className}` : ""}`}>
      <div className={styles.label}>
        <span>Collateral locked</span>
        <span className={styles.lock}>
          <Lock aria-hidden="true" />
          Sealed
        </span>
      </div>
      <div className={styles.stage}>
        <div className={styles.blocks} aria-hidden="true">
          {"▓▓▓▓▓▓"}
        </div>
        <div
          className={styles.frost}
          role="img"
          aria-label="The collateral amount is hidden behind a frosted veil"
        >
          <span className={styles.glyph} aria-hidden="true">
            <EyeOff />
          </span>
          <span className={styles.hidden}>hidden</span>
        </div>
      </div>
      <p className={styles.foot}>
        We prove <b>{"≥"} {POSITION.thresholdEth}</b>{" "}
        <span className={styles.sub}>(threshold)</span>
      </p>
    </div>
  );
}
