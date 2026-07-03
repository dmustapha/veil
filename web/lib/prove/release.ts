// Client-side RELEASE-witness assembly + type definitions for Veil v3. Everything here runs on the
// user's device; the private note fields (amount, blindingIn, spendPk, nk, r) never leave the
// browser — only the resulting Groth16 proof + its public outputs (nullifierOut, C0, recipient,
// rootPool, rootRepaid) go on-chain.
//
// A release redeems one LOCKED note (proven in the pool tree, nullifier published, repayment proven
// in the repaid tree) and mints no new note — it unlocks the collateral to `recipient`. The proof's
// public signals are, in snarkjs order: [nullifierOut, C0, recipient, rootPool, rootRepaid] — exactly
// what `veil-pool.release` passes to the deployed release verifier.
import { BN254_R, TREE_DEPTH } from "./witness";

/** u128 upper bound; the circuit range-binds `amount` to `[0, 2^128)`. */
const MAX_U128 = 1n << 128n;

/**
 * The LOCKED note being released, plus the spend key and binding random — the PRIVATE witness fields
 * for `release_repaid.circom`. `spendPk` MUST equal `H1(nk, DS_NK=0x34)` (the circuit constrains
 * `nkBind.out === spendPk`), so a note determines exactly one nullifier.
 * `r` is the B1′ binding random: the circuit enforces `lockId === Poseidon2(C0, r, DS_LOCKBIND=0x35)`.
 * `C0` is the public note commitment (also a public signal in the released proof).
 */
export interface ReleaseNote {
  C0: bigint; // public note commitment (bound into proof as public signal)
  amount: bigint; // hidden loan amount
  blindingIn: bigint; // LOCKED note blinding factor
  spendPk: bigint; // note spend pubkey = H1(nk, 0x34)
  nk: bigint; // nullifier key (secret); never transmitted
  lockId: bigint; // lock identifier binding C0 to the lock record
  r: bigint; // B1′ binding random: lockId = Poseidon2(C0, r, 0x35)
}

/** The LOCKED note's position in the pool tree: index, sibling path, and the root it proves against. */
export interface ReleaseMerklePath {
  leafIndex: bigint;
  pathElements: bigint[]; // length TREE_DEPTH
  root: bigint;
}

/** The full `release_repaid.circom` input (snarkjs accepts decimal strings). */
export interface ReleaseWitness {
  C0: string;
  recipient: string;
  rootPool: string;
  rootRepaid: string;
  amount: string;
  blindingIn: string;
  spendPk: string;
  nk: string;
  lockId: string;
  r: string;
  leafIndex: string;
  pathElements: string[];
  repaidLeafIndex: string;
  repaidPathElements: string[];
}

/**
 * Assemble the release witness locally. Throws (fail early, on-device) if either path depth is wrong,
 * the amount exceeds the circuit's `[0, 2^128)` range, or any field-valued signal is non-canonical —
 * all of which would otherwise fail deep in snarkjs witness generation with an opaque error.
 *
 * @param note         - The LOCKED note secrets (C0, amount, blinding, spendPk, nk, lockId, r).
 * @param poolPath     - Merkle path + root for the LOCKED note in the pool tree.
 * @param repaidPath   - Merkle path + root for the repayment entry in the repaid tree.
 * @param recipientField - Recipient address encoded as a canonical BN254 field element.
 */
export function buildReleaseWitness(
  note: ReleaseNote,
  poolPath: ReleaseMerklePath,
  repaidPath: ReleaseMerklePath,
  recipientField: bigint,
): ReleaseWitness {
  if (poolPath.pathElements.length !== TREE_DEPTH) {
    throw new Error(`poolPath pathElements must be depth ${TREE_DEPTH}, got ${poolPath.pathElements.length}`);
  }
  if (repaidPath.pathElements.length !== TREE_DEPTH) {
    throw new Error(`repaidPath pathElements must be depth ${TREE_DEPTH}, got ${repaidPath.pathElements.length}`);
  }
  if (poolPath.leafIndex < 0n || poolPath.leafIndex >= 1n << BigInt(TREE_DEPTH)) {
    throw new Error(`poolPath leafIndex must be in [0, 2^${TREE_DEPTH})`);
  }
  if (repaidPath.leafIndex < 0n || repaidPath.leafIndex >= 1n << BigInt(TREE_DEPTH)) {
    throw new Error(`repaidPath leafIndex must be in [0, 2^${TREE_DEPTH})`);
  }
  if (note.amount < 0n || note.amount >= MAX_U128) {
    throw new Error("amount must be in [0, 2^128)");
  }
  // Every field-valued signal must be a canonical BN254 element, else snarkjs fails deep in witness
  // generation with an opaque error instead of this clear on-device throw.
  for (const [name, val] of [
    ["C0", note.C0],
    ["blindingIn", note.blindingIn],
    ["spendPk", note.spendPk],
    ["nk", note.nk],
    ["lockId", note.lockId],
    ["r", note.r],
    ["recipient", recipientField],
    ["rootPool", poolPath.root],
    ["rootRepaid", repaidPath.root],
    ...poolPath.pathElements.map((e, i) => [`pathElements[${i}]`, e] as const),
    ...repaidPath.pathElements.map((e, i) => [`repaidPathElements[${i}]`, e] as const),
  ] as const) {
    if (val < 0n || val >= BN254_R) throw new Error(`${name} is not a canonical BN254 field element`);
  }
  return {
    C0: note.C0.toString(),
    recipient: recipientField.toString(),
    rootPool: poolPath.root.toString(),
    rootRepaid: repaidPath.root.toString(),
    amount: note.amount.toString(),
    blindingIn: note.blindingIn.toString(),
    spendPk: note.spendPk.toString(),
    nk: note.nk.toString(),
    lockId: note.lockId.toString(),
    r: note.r.toString(),
    leafIndex: poolPath.leafIndex.toString(),
    pathElements: poolPath.pathElements.map((e) => e.toString()),
    repaidLeafIndex: repaidPath.leafIndex.toString(),
    repaidPathElements: repaidPath.pathElements.map((e) => e.toString()),
  };
}
