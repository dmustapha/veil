// Unit tests for the release-witness assembler (release.ts). Verifies that:
//   - `buildReleaseWitness` emits all fields as canonical decimal strings
//   - validation errors throw with descriptive messages (fail-fast before snarkjs)
//   - `publicSignalsToReleaseArgs` maps the [nullifierOut, C0, recipient, rootPool, rootRepaid] order
import { describe, expect, it } from "vitest";
import { BN254_R, TREE_DEPTH } from "./witness";
import { buildReleaseWitness, type ReleaseNote, type ReleaseMerklePath } from "./release";
import { publicSignalsToReleaseArgs } from "./groth16";

/** A minimal valid ReleaseNote drawn from the known-good release_repaid_input.json fixture. */
function validNote(): ReleaseNote {
  return {
    C0: 20115123320993369270665198830152780270564200073127867208647898654550873152277n,
    amount: 2_000_000_000_000_000_000n,
    blindingIn: 7n,
    spendPk: 2959944021135107534354482395319063899239552202030878317183496805275873812658n,
    nk: 5n,
    lockId: 16364098519195311840046812454716912643422875735580436168170058377419869158626n,
    r: 5926303456104307956615723263243741479687621076890576105216036539902176685936n,
  };
}

/** A minimal valid pool Merkle path (root + pathElements are non-zero canonical field elements). */
function validPoolPath(): ReleaseMerklePath {
  return {
    leafIndex: 0n,
    pathElements: Array(TREE_DEPTH).fill(1n),
    root: 16388206346681066701161845109678736377960218718150679185300879828252533944469n,
  };
}

/** A minimal valid repaid Merkle path. */
function validRepaidPath(): ReleaseMerklePath {
  return {
    leafIndex: 0n,
    pathElements: Array(TREE_DEPTH).fill(1n),
    root: 8437805998329716238586653629220405481527633240387622213250761925739815132725n,
  };
}

const RECIPIENT = 2326216754113504051064697101041423920987551170814345948727164490837966600965n;

describe("buildReleaseWitness — field emission", () => {
  it("emits all fields as decimal strings", () => {
    const w = buildReleaseWitness(validNote(), validPoolPath(), validRepaidPath(), RECIPIENT);
    expect(w.C0).toBe(validNote().C0.toString());
    expect(w.recipient).toBe(RECIPIENT.toString());
    expect(w.rootPool).toBe(validPoolPath().root.toString());
    expect(w.rootRepaid).toBe(validRepaidPath().root.toString());
    expect(w.amount).toBe("2000000000000000000");
    expect(w.blindingIn).toBe("7");
    expect(w.nk).toBe("5");
    expect(w.leafIndex).toBe("0");
    expect(w.repaidLeafIndex).toBe("0");
  });

  it("emits pathElements as decimal string arrays of correct depth", () => {
    const w = buildReleaseWitness(validNote(), validPoolPath(), validRepaidPath(), RECIPIENT);
    expect(w.pathElements).toHaveLength(TREE_DEPTH);
    expect(w.repaidPathElements).toHaveLength(TREE_DEPTH);
    for (const e of w.pathElements) expect(typeof e).toBe("string");
    for (const e of w.repaidPathElements) expect(typeof e).toBe("string");
  });

  it("accepts canonical max field values", () => {
    const note = { ...validNote(), blindingIn: BN254_R - 1n };
    expect(() => buildReleaseWitness(note, validPoolPath(), validRepaidPath(), RECIPIENT)).not.toThrow();
    const w = buildReleaseWitness(note, validPoolPath(), validRepaidPath(), RECIPIENT);
    expect(w.blindingIn).toBe((BN254_R - 1n).toString());
  });
});

describe("buildReleaseWitness — path validation", () => {
  it("rejects poolPath with wrong depth", () => {
    const path = { ...validPoolPath(), pathElements: [1n] };
    expect(() => buildReleaseWitness(validNote(), path, validRepaidPath(), RECIPIENT)).toThrow(/depth/);
  });

  it("rejects repaidPath with wrong depth", () => {
    const path = { ...validRepaidPath(), pathElements: [1n] };
    expect(() => buildReleaseWitness(validNote(), validPoolPath(), path, RECIPIENT)).toThrow(/depth/);
  });

  it("rejects out-of-range poolPath leafIndex", () => {
    const path = { ...validPoolPath(), leafIndex: 1n << BigInt(TREE_DEPTH) };
    expect(() => buildReleaseWitness(validNote(), path, validRepaidPath(), RECIPIENT)).toThrow(/leafIndex/);
  });

  it("rejects out-of-range repaidPath leafIndex", () => {
    const path = { ...validRepaidPath(), leafIndex: 1n << BigInt(TREE_DEPTH) };
    expect(() => buildReleaseWitness(validNote(), validPoolPath(), path, RECIPIENT)).toThrow(/leafIndex/);
  });
});

describe("buildReleaseWitness — scalar validation", () => {
  it("rejects amount >= 2^128", () => {
    expect(() =>
      buildReleaseWitness({ ...validNote(), amount: 1n << 128n }, validPoolPath(), validRepaidPath(), RECIPIENT),
    ).toThrow(/amount/);
  });

  it("rejects non-canonical C0", () => {
    expect(() =>
      buildReleaseWitness({ ...validNote(), C0: BN254_R }, validPoolPath(), validRepaidPath(), RECIPIENT),
    ).toThrow(/canonical/);
  });

  it("rejects non-canonical blindingIn", () => {
    expect(() =>
      buildReleaseWitness({ ...validNote(), blindingIn: BN254_R }, validPoolPath(), validRepaidPath(), RECIPIENT),
    ).toThrow(/canonical/);
  });

  it("rejects non-canonical recipient", () => {
    expect(() => buildReleaseWitness(validNote(), validPoolPath(), validRepaidPath(), BN254_R)).toThrow(/canonical/);
  });

  it("rejects non-canonical rootPool", () => {
    const path = { ...validPoolPath(), root: BN254_R };
    expect(() => buildReleaseWitness(validNote(), path, validRepaidPath(), RECIPIENT)).toThrow(/canonical/);
  });

  it("rejects non-canonical rootRepaid", () => {
    const path = { ...validRepaidPath(), root: BN254_R };
    expect(() => buildReleaseWitness(validNote(), validPoolPath(), path, RECIPIENT)).toThrow(/canonical/);
  });
});

describe("publicSignalsToReleaseArgs — signal ordering", () => {
  it("maps [nullifierOut, C0, recipient, rootPool, rootRepaid] correctly", () => {
    const signals = ["1", "2", "3", "4", "5"];
    const args = publicSignalsToReleaseArgs(signals);
    expect(args.nullifier).toBe(1n);
    expect(args.c0).toBe(2n);
    expect(args.recipient).toBe(3n);
    expect(args.rootPool).toBe(4n);
    expect(args.rootRepaid).toBe(5n);
  });

  it("throws on wrong signal count", () => {
    expect(() => publicSignalsToReleaseArgs(["1", "2", "3", "4"])).toThrow(/5/);
    expect(() => publicSignalsToReleaseArgs(["1", "2", "3", "4", "5", "6"])).toThrow(/5/);
  });
});
