// Client-side borrow-witness assembly for Veil v3. Everything here runs on the user's device; the
// private note fields (amount, blinding, spendPk, lockId, loanSecret) never leave the browser — only
// the resulting Groth16 proof + public signals are sent on-chain.
import { keccak256, toBytes } from "viem";

/** BN254 scalar field modulus `r` — the field the borrow circuit's signals live in. */
export const BN254_R =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

/** Merkle depth of the veil-pool note tree (matches circom `MerkleProof(16)`). */
export const TREE_DEPTH = 16;

/** u128 upper bound; the circuit range-binds `amount`/`threshold` to `[0, 2^128)` before comparing. */
const MAX_U128 = 1n << 128n;

/**
 * A LOCKED shielded note the borrower owns, plus the loan secret — the PRIVATE witness fields for the
 * borrow circuit. Held client-side (localStorage/device); never transmitted.
 */
export interface Note {
  amount: bigint; // hidden collateral amount (wstETH-units)
  blinding: bigint; // commitment blinding factor
  spendPk: bigint; // note spend pubkey
  lockId: bigint; // lock identifier (→ lockHandle)
  loanSecret: bigint; // → positionId
}

/** The note's position in the pool tree: index, sibling path, and the root it proves against. */
export interface MerklePath {
  leafIndex: bigint;
  pathElements: bigint[]; // length TREE_DEPTH
  root: bigint;
}

/** The full `borrow.circom` input (snarkjs accepts decimal strings). */
export interface BorrowWitness {
  root: string;
  threshold: string;
  borrower: string;
  amount: string;
  blinding: string;
  spendPk: string;
  lockId: string;
  leafIndex: string;
  pathElements: string[];
  loanSecret: string;
}

/**
 * borrower binding = `keccak256(strkey) mod r` — byte-identical to the vault's `borrower_field`
 * (contracts/veil-vault/src/lib.rs). The circuit's public `borrower` signal must equal this so a
 * proof is redeemable only from the Stellar account that produced it (anti-replay). `strkey` is the
 * `G...` account address string; we hash its UTF-8 bytes, exactly as the contract hashes `strkey`.
 */
export function borrowerField(strkey: string): bigint {
  return BigInt(keccak256(toBytes(strkey))) % BN254_R;
}

/**
 * Assemble the borrow witness locally. `threshold` is the public floor the hidden amount must clear.
 * Throws (fail early, on-device) if the path depth is wrong, the amounts exceed the circuit's
 * `[0, 2^128)` range, or the note can't clear the threshold — all of which would make the proof
 * unprovable downstream.
 */
export function buildBorrowWitness(
  note: Note,
  path: MerklePath,
  threshold: bigint,
  borrowerStrkey: string,
): BorrowWitness {
  if (path.pathElements.length !== TREE_DEPTH) {
    throw new Error(`pathElements must be depth ${TREE_DEPTH}, got ${path.pathElements.length}`);
  }
  if (path.leafIndex < 0n || path.leafIndex >= 1n << BigInt(TREE_DEPTH)) {
    throw new Error(`leafIndex must be in [0, 2^${TREE_DEPTH})`);
  }
  if (note.amount < 0n || note.amount >= MAX_U128 || threshold < 0n || threshold >= MAX_U128) {
    throw new Error("amount and threshold must be in [0, 2^128)");
  }
  if (note.amount < threshold) {
    throw new Error("note amount is below the threshold — the borrow proof would be unprovable");
  }
  // Every field-valued signal must be a canonical BN254 element, else snarkjs fails deep in witness
  // generation with an opaque error instead of this clear on-device throw (audit L-01).
  for (const [name, val] of [
    ["blinding", note.blinding], ["spendPk", note.spendPk], ["lockId", note.lockId],
    ["loanSecret", note.loanSecret], ["root", path.root], ...path.pathElements.map((e, i) => [`pathElements[${i}]`, e] as const),
  ] as const) {
    if (val < 0n || val >= BN254_R) throw new Error(`${name} is not a canonical BN254 field element`);
  }
  return {
    root: path.root.toString(),
    threshold: threshold.toString(),
    borrower: borrowerField(borrowerStrkey).toString(),
    amount: note.amount.toString(),
    blinding: note.blinding.toString(),
    spendPk: note.spendPk.toString(),
    lockId: note.lockId.toString(),
    leafIndex: path.leafIndex.toString(),
    pathElements: path.pathElements.map((e) => e.toString()),
    loanSecret: note.loanSecret.toString(),
  };
}
