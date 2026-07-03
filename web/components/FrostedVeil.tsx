import { EyeOff, Lock } from "lucide-react";
import styles from "./FrostedVeil.module.css";

/**
 * Signature 1: the frosted veil. The exact collateral amount sits behind
 * real frosted glass and is NEVER rendered: only redaction blocks and the
 * fact that it clears the required threshold are ever shown. Privacy invariant.
 */
export function FrostedVeil({ className, sealed = true }: { className?: string; sealed?: boolean }) {
  return (
    <div className={`${styles.veil}${className ? ` ${className}` : ""}`}>
      <div className={styles.label}>
        <span>{sealed ? "Collateral locked" : "Collateral pending"}</span>
        <span className={styles.lock}>
          <Lock aria-hidden="true" />
          {sealed ? "Sealed" : "Not locked"}
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
        {sealed ? (
          <>
            We prove it <b>clears the threshold</b>{" "}
            <span className={styles.sub}>(amount stays hidden)</span>
          </>
        ) : (
          <>
            Lock on Ethereum to <b>seal this position</b>{" "}
            <span className={styles.sub}>(nothing on-chain yet)</span>
          </>
        )}
      </p>
    </div>
  );
}
