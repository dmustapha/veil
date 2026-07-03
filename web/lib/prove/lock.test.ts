// Unit tests for the lock-witness assembler (lock.ts). Verifies that:
//   - `r` is included in the witness and validated as a canonical BN254 field element
//   - non-canonical `r` throws with a /canonical/ message (fail-fast before snarkjs)
import { describe, expect, it } from "vitest";
import { BN254_R, TREE_DEPTH } from "./witness";
import { buildLockWitness, type LockNote, type LockMerklePath } from "./lock";

/** A minimal valid LockNote drawn from the known-good lock_input.json fixture. */
function validLockNote(): LockNote {
  return {
    amount: 2_000_000_000_000_000_000n,
    blindingIn: 1n,
    spendPk: 2959944021135107534354482395319063899239552202030878317183496805275873812658n,
    nk: 5n,
    lockId: 16364098519195311840046812454716912643422875735580436168170058377419869158626n,
    blindingOut: 7n,
    r: 5926303456104307956615723263243741479687621076890576105216036539902176685936n,
  };
}

/** A minimal valid Merkle path (root + pathElements are non-zero canonical field elements). */
function validPath(): LockMerklePath {
  return {
    leafIndex: 0n,
    pathElements: Array(TREE_DEPTH).fill(1n),
    root: 10430530646939490938009233289293127101399568688577370089853992508266683098477n,
  };
}

describe("buildLockWitness — r field (B1′ binding random)", () => {
  it("includes r as a decimal string in the witness", () => {
    const note = { ...validLockNote(), r: 5n };
    expect(buildLockWitness(note, validPath()).r).toBe("5");
  });

  it("accepts any canonical r (non-zero, < BN254_R)", () => {
    const note = { ...validLockNote(), r: BN254_R - 1n };
    expect(() => buildLockWitness(note, validPath())).not.toThrow();
    expect(buildLockWitness(note, validPath()).r).toBe((BN254_R - 1n).toString());
  });

  it("rejects r === BN254_R (non-canonical)", () => {
    expect(() => buildLockWitness({ ...validLockNote(), r: BN254_R }, validPath())).toThrow(/canonical/);
  });

  it("rejects r > BN254_R", () => {
    expect(() => buildLockWitness({ ...validLockNote(), r: BN254_R + 1n }, validPath())).toThrow(/canonical/);
  });

  it("rejects r < 0n", () => {
    expect(() => buildLockWitness({ ...validLockNote(), r: -1n }, validPath())).toThrow(/canonical/);
  });
});

describe("buildLockWitness — general validation", () => {
  it("rejects wrong path depth", () => {
    const path = { ...validPath(), pathElements: [1n] };
    expect(() => buildLockWitness(validLockNote(), path)).toThrow(/depth/);
  });

  it("rejects out-of-range amount", () => {
    expect(() => buildLockWitness({ ...validLockNote(), amount: 1n << 128n }, validPath())).toThrow(/amount/);
  });

  it("rejects non-canonical blindingOut", () => {
    expect(() => buildLockWitness({ ...validLockNote(), blindingOut: BN254_R }, validPath())).toThrow(/canonical/);
  });
});
