/** Shared response shape for the /api/cheat exhibit. */

export type Source = "live" | "cached";

export type CheatResponse = {
  source: Source;
  /** True when a tampered proof is rejected on-chain (always true — the defense is real). */
  rejected: boolean;
  /** Soroban error surfaced by the live tamper, e.g. "Error(Contract, #0)". */
  code: string;
  reason: string;
  /** Short human diagnostic. */
  detail: string;
  /** The complementary replay defense, surfaced for context. */
  replayCode: string;
};
