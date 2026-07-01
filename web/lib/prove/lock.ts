// Client-side LOCK-witness assembly + Groth16 prover for Veil v3. Everything here runs on the user's
// device; the private note fields (amount, blindingIn, spendPk, nk, blindingOut) never leave the
// browser — only the resulting proof + its public outputs (nullifierOut, commitmentOut) go on-chain.
//
// A lock spends one AVAILABLE note (proven a member of the pool root, nullifier published) and mints
// one LOCKED note of the SAME hidden amount bound to `lockId`. The proof's public signals are, in
// snarkjs order: [nullifierOut, commitmentOut, root, lockId] — exactly what `veil-pool.lock` passes
// to the deployed lock verifier and the args (nullifier, commitment) it burns/inserts.
import { BN254_R, TREE_DEPTH } from "./witness";

/** u128 upper bound; the circuit range-binds `amount` to `[0, 2^128)` (audit M-02). */
const MAX_U128 = 1n << 128n;

/**
 * The AVAILABLE note being locked, plus the spend key and the fresh output blinding — the PRIVATE
 * witness for `lock.circom`. `spendPk` MUST equal `H1(nk, DS_NK=0x34)` (the circuit constrains
 * `nkBind.out === spendPk`, audit C-01), so a note determines exactly one nullifier.
 */
export interface LockNote {
  amount: bigint; // hidden collateral amount (same in the AVAILABLE and minted LOCKED note)
  blindingIn: bigint; // the AVAILABLE note's blinding
  spendPk: bigint; // note spend pubkey = H1(nk, 0x34)
  nk: bigint; // nullifier key (secret); the pool never sees it
  lockId: bigint; // lock identifier bound into the LOCKED note (aux) and public signal
  blindingOut: bigint; // fresh blinding for the minted LOCKED note
}

/** The AVAILABLE note's position in the pool tree: index, sibling path, and the root it proves against. */
export interface LockMerklePath {
  leafIndex: bigint;
  pathElements: bigint[]; // length TREE_DEPTH
  root: bigint;
}

/** The full `lock.circom` input (snarkjs accepts decimal strings). */
export interface LockWitness {
  root: string;
  lockId: string;
  amount: string;
  blindingIn: string;
  spendPk: string;
  nk: string;
  leafIndex: string;
  pathElements: string[];
  blindingOut: string;
}

/**
 * Assemble the lock witness locally. Throws (fail early, on-device) if the path depth is wrong, the
 * amount exceeds the circuit's `[0, 2^128)` range, or any field-valued signal is non-canonical — all
 * of which would otherwise fail deep in snarkjs witness generation with an opaque error.
 */
export function buildLockWitness(note: LockNote, path: LockMerklePath): LockWitness {
  if (path.pathElements.length !== TREE_DEPTH) {
    throw new Error(`pathElements must be depth ${TREE_DEPTH}, got ${path.pathElements.length}`);
  }
  if (path.leafIndex < 0n || path.leafIndex >= 1n << BigInt(TREE_DEPTH)) {
    throw new Error(`leafIndex must be in [0, 2^${TREE_DEPTH})`);
  }
  if (note.amount < 0n || note.amount >= MAX_U128) {
    throw new Error("amount must be in [0, 2^128)");
  }
  for (const [name, val] of [
    ["blindingIn", note.blindingIn], ["spendPk", note.spendPk], ["nk", note.nk],
    ["lockId", note.lockId], ["blindingOut", note.blindingOut], ["root", path.root],
    ...path.pathElements.map((e, i) => [`pathElements[${i}]`, e] as const),
  ] as const) {
    if (val < 0n || val >= BN254_R) throw new Error(`${name} is not a canonical BN254 field element`);
  }
  return {
    root: path.root.toString(),
    lockId: note.lockId.toString(),
    amount: note.amount.toString(),
    blindingIn: note.blindingIn.toString(),
    spendPk: note.spendPk.toString(),
    nk: note.nk.toString(),
    leafIndex: path.leafIndex.toString(),
    pathElements: path.pathElements.map((e) => e.toString()),
    blindingOut: note.blindingOut.toString(),
  };
}
