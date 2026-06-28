"use client";

/**
 * Local persistence for a user's positions. The secret S lives ONLY here in the
 * browser (it unlocks the collateral on repay) and is never sent to any server.
 * The collateral amount is deliberately NOT stored: it is the user's input on
 * the lock form and never needs to be read back (privacy invariant).
 */

export type StoredPosition = {
  /** keccak256(S), the hashlock keying the escrow lock and the Soroban loan. */
  h: string;
  /** 32-byte secret S (0x). Local only. Reveals on repay to unlock collateral. */
  secret: string;
  /** Unix seconds the escrow lock is redeemable until. */
  deadline: number;
  termDays: number;
  /** Sepolia tx hash of the lock. */
  lockTx: string;
  createdAt: number;
  /** Stellar tx hash of a settled borrow. */
  borrowTx?: string;
  /** Stellar tx hash of a settled repay. */
  repayTx?: string;
  /** Sepolia tx hash of the collateral claim (claimRepaid). */
  claimTx?: string;
};

const KEY = "veil.positions.v1";

/** A stored position is only usable if the fields the UI dereferences are present. */
function isValid(x: unknown): x is StoredPosition {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return (
    typeof p.h === "string" &&
    typeof p.secret === "string" &&
    typeof p.lockTx === "string" &&
    typeof p.deadline === "number"
  );
}

export function loadPositions(): StoredPosition[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Tolerate valid-JSON-but-wrong-shape (old/corrupted entries): drop anything
    // missing the fields the cards + flows read, so a bad entry can never crash /app.
    return Array.isArray(parsed) ? parsed.filter(isValid) : [];
  } catch {
    return [];
  }
}

function save(list: StoredPosition[]) {
  window.localStorage.setItem(KEY, JSON.stringify(list));
}

export function addPosition(p: StoredPosition): StoredPosition[] {
  const next = [p, ...loadPositions().filter((x) => x.h !== p.h)];
  save(next);
  return next;
}

export function updatePosition(
  h: string,
  patch: Partial<StoredPosition>
): StoredPosition[] {
  const next = loadPositions().map((x) => (x.h === h ? { ...x, ...patch } : x));
  save(next);
  return next;
}
