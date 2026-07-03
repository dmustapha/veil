// Veil v3 shielded-note cryptography for the browser — the client-side twin of
// contracts/veil-pool/src/notes.rs. Every hash here is byte-identical to a circom template (built on
// `hash2` = circom `Poseidon2(2)`), so a note committed on-chain is provable by the browser circuit
// and vice versa. Locked by the cross-impl golden vectors in notes.test.ts.
import { hash2, P } from "./poseidon2";

/** Note-domain separation tags (carried by the Poseidon capacity element). A LOCKED note can never
 *  collide with an AVAILABLE note of the same opening. */
export const DS_NOTE_AVAILABLE = 0x10n;
export const DS_NOTE_LOCKED = 0x11n;
/** Nullifier-hash domain — distinct from the note domains so a nullifier can't collide with a note. */
export const DS_NF = 0x20n;
/** Single-input domain tags (v2's SHA256(TAG‖x) family, now Poseidon2). */
export const DS_POS = 0x30n; // position_id
export const DS_LOCK = 0x31n; // lock_handle
export const DS_REPAID = 0x32n; // repaid_leaf
export const DS_LIQUIDATED = 0x33n; // liquidated_leaf
export const DS_NK = 0x34n; // spendPk ← nk binding

const U128_MAX = 1n << 128n;

function assertField(name: string, x: bigint): bigint {
  if (x < 0n || x >= P) throw new Error(`${name} is not a canonical BN254 field element`);
  return x;
}

/**
 * Encode an i128 collateral amount as a field element (contracts/veil-pool `amount_to_field`): the
 * amount's magnitude in `[0, 2^128)` maps directly to the same integer < P.
 */
export function amountToField(amount: bigint): bigint {
  if (amount < 0n || amount >= U128_MAX) throw new Error("amount must be in [0, 2^128)");
  return amount;
}

/** Single-input domain hash `H1(x, ds) = hash2(x, 0, ds)` (circom `DomainHash1`). */
export function domainHash1(x: bigint, ds: bigint): bigint {
  return hash2(assertField("domainHash1 input", x), 0n, ds);
}

/** Public loan identity bound to a borrower secret: `H1(loanSecret, DS_POS)`. */
export const positionId = (loanSecret: bigint): bigint => domainHash1(loanSecret, DS_POS);
/** Ties a loan to one on-chain lock: `H1(lockId, DS_LOCK)`. */
export const lockHandle = (lockId: bigint): bigint => domainHash1(lockId, DS_LOCK);
/** Repaid-tree leaf: `H1(lockHandle, DS_REPAID)`. */
export const repaidLeaf = (lh: bigint): bigint => domainHash1(lh, DS_REPAID);
/** Liquidated-tree leaf: `H1(lockHandle, DS_LIQUIDATED)`. */
export const liquidatedLeaf = (lh: bigint): bigint => domainHash1(lh, DS_LIQUIDATED);
/** Derive a note's spend pubkey from its nullifier key: `spendPk = H1(nk, DS_NK)` (closes audit C-01). */
export const spendPkFromNk = (nk: bigint): bigint => domainHash1(nk, DS_NK);

/**
 * Note commitment — a domain-separated chain of `hash2` over the opening (circom `NoteCommitment`):
 *   C = H(H(H(amount, spendPk, ds), blinding, ds), aux, ds)
 * `ds` is DS_NOTE_AVAILABLE or DS_NOTE_LOCKED; `aux` carries the lockId for LOCKED notes, 0 otherwise.
 */
export function noteCommitment(
  ds: bigint,
  amount: bigint,
  spendPk: bigint,
  blinding: bigint,
  aux: bigint,
): bigint {
  const h1 = hash2(assertField("amount", amount), assertField("spendPk", spendPk), ds);
  const h2 = hash2(h1, assertField("blinding", blinding), ds);
  return hash2(h2, assertField("aux", aux), ds);
}

/**
 * Key-derived nullifier (circom `Nullifier`): nf = H(H(nk, C, DS_NF), leafIndex, DS_NF).
 * Deterministic in (nk, C, leafIndex) so a double-spend yields the same nullifier; unlinkable to the
 * note without `nk`.
 */
export function nullifier(nk: bigint, commitment: bigint, leafIndex: bigint): bigint {
  const h1 = hash2(assertField("nk", nk), assertField("commitment", commitment), DS_NF);
  return hash2(h1, leafIndex, DS_NF);
}
