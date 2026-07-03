// Build circom/release_repaid_input.json from the lock fixture + a 1-leaf pool tree (C1) and
// a 1-leaf repaid tree (repaid_leaf(lock_handle(lockId))).
//
// Actual exported names confirmed from source:
//   poseidon2.ts  → hash2(a, b, sep)          (NOT poseidon2Hash2)
//   notes.ts      → noteCommitment, domainHash1 (also lockHandle, repaidLeaf as helpers)
//   tree.ts       → buildMerklePath(leaves, index) → {leafIndex, pathElements, root}
//                  (NOT buildTree / merklePath)
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { hash2, P } from "@/lib/prove/poseidon2";
import { noteCommitment, domainHash1, DS_NOTE_AVAILABLE, DS_NOTE_LOCKED, DS_LOCK, DS_REPAID } from "@/lib/prove/notes";
import { buildMerklePath } from "@/lib/prove/tree";
import { keccak256, toBytes } from "viem";

const DS_LOCKBIND = 0x35n;

const lockPath = resolve(__dirname, "../../circom/lock_input.json");
const lock = JSON.parse(readFileSync(lockPath, "utf8"));

const amount    = BigInt(lock.amount);
const spendPk   = BigInt(lock.spendPk);
const nk        = BigInt(lock.nk);
const lockId    = BigInt(lock.lockId);
const r         = BigInt(lock.r);
const blindingIn  = BigInt(lock.blindingIn);   // blinding of the AVAILABLE note C0
const blindingOut = BigInt(lock.blindingOut);   // blinding of the LOCKED note C1

// C0 = AVAILABLE note commitment (the escrow key on Ethereum)
// Must match lock.circom's cin.out = NoteCommitment(0x10, amount, spendPk, blindingIn, aux=0)
const c0 = noteCommitment(DS_NOTE_AVAILABLE, amount, spendPk, blindingIn, 0n);

// Verify the B1' binding: lockId must equal Poseidon2(C0, r, DS_LOCKBIND)
const expectedLockId = hash2(c0, r, DS_LOCKBIND);
if (expectedLockId !== lockId) {
  throw new Error(
    `lockId mismatch: lock_input.json has ${lockId}, but Poseidon2(C0,r,0x35)=${expectedLockId}`
  );
}

// C1 = LOCKED note commitment (the pool leaf that release_repaid will consume)
// blindingIn in release_repaid.circom is the LOCKED note's blinding (= blindingOut from lock)
const c1 = noteCommitment(DS_NOTE_LOCKED, amount, spendPk, blindingOut, lockId);

// Pool tree: 1-leaf tree with C1 at index 0
const poolPath = buildMerklePath([c1], 0);

// Repaid tree: leaf = repaid_leaf(lock_handle(lockId)) = H1(H1(lockId, DS_LOCK), DS_REPAID)
const repaidLeafVal = domainHash1(domainHash1(lockId, DS_LOCK), DS_REPAID);
const repaidPath = buildMerklePath([repaidLeafVal], 0);

// Recipient: keccak256 of EVM address mod BN254_r
const evm = "0xe9179cEf0000000000000000000000000000dead";
const recipient = BigInt(keccak256(toBytes(evm))) % P;

const out = {
  // public
  C0:          c0.toString(),
  recipient:   recipient.toString(),
  rootPool:    poolPath.root.toString(),
  rootRepaid:  repaidPath.root.toString(),
  // private
  amount:      amount.toString(),
  blindingIn:  blindingOut.toString(),  // LOCKED note blinding (= lock's blindingOut)
  spendPk:     spendPk.toString(),
  nk:          nk.toString(),
  lockId:      lockId.toString(),
  r:           r.toString(),
  leafIndex:   "0",
  pathElements: poolPath.pathElements.map(String),
  repaidLeafIndex: "0",
  repaidPathElements: repaidPath.pathElements.map(String),
};

writeFileSync(
  resolve(__dirname, "../../circom/release_repaid_input.json"),
  JSON.stringify(out, null, 2) + "\n",
);
console.log("release_repaid_input.json written");
console.log("  C0      =", c0.toString());
console.log("  C1      =", c1.toString());
console.log("  rootPool=", poolPath.root.toString());
console.log("  rootRepaid=", repaidPath.root.toString());
