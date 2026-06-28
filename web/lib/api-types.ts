/** Shared response shapes for the live /api/state and /api/cheat routes. */

export type Source = "live" | "cached";

export type StatePrice = {
  /** ETH/USD formatted, e.g. "1,575.61". */
  usd: string;
  /** Raw oracle integer (string to survive JSON). */
  raw: string;
  decimals: number;
};

export type StateLoan = {
  /** Disbursed principal in USDC, e.g. "1.97". */
  principalUsdc: string;
  thresholdWei: string;
  repaid: boolean;
};

export type StateConfig = {
  /** Loan-to-value in percent, e.g. "25". */
  ltv: string;
  imageId: string;
  verifier: string;
};

export type StateLock = {
  /** Escrow lock present + closed (collateral sealed). amount is NEVER returned. */
  locked: boolean;
  closed: boolean;
};

export type StateResponse = {
  source: Source;
  price: StatePrice;
  loan: StateLoan;
  config: StateConfig;
  lock: StateLock;
  /** Per-leg detail so the UI can show which read was live vs cached. */
  legs: { soroban: Source; reflector: Source; sepolia: Source };
};

/**
 * Per-position live read for a user-supplied hashlock H. The collateral amount
 * is DELIBERATELY absent: only the public threshold + loan facts are returned.
 */
export type PositionResponse = {
  source: Source;
  h: string;
  /** Escrow lock on Sepolia. amount is NEVER included (privacy invariant). */
  lock: { locked: boolean; closed: boolean } | null;
  /** Vault loan, if a borrow has settled against this H. */
  loan:
    | {
        principalUsdc: string;
        thresholdWei: string;
        repaid: boolean;
        defaulted: boolean;
        dueLedger: number;
      }
    | null;
  /** Live ETH/USD from Reflector, for health math on the client. */
  price: StatePrice;
  /** Loan-to-value in percent, e.g. "25". */
  ltv: string;
};

export type CheatResponse = {
  source: Source;
  /** True when the live vault rejected the tampered proof as expected. */
  rejected: boolean;
  /** Soroban error code, e.g. "Error(Crypto, InvalidInput)". */
  code: string;
  reason: string;
  /** Raw simulation diagnostic (trimmed). */
  detail: string;
  /** The complementary replay defense, surfaced for context. */
  replayCode: string;
};
