// Tree reconstruction correctness: the single-leaf circom MerkleProof(16) vector, empty-tree root,
// hole/conflict detection, and the core membership invariant — re-folding a derived path with the
// leaf-index bits must reproduce the root (exactly what the borrow circuit checks).
import { describe, expect, it } from "vitest";
import { nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { compress } from "./poseidon2";
import { ZERO_LEVELS } from "./zeroes";
import {
  TREE_DEPTH, buildMerklePath, computeRoot, decodeLeafEvent, indexLeaves, pathForCommitment,
} from "./tree";
import { amountToField, noteCommitment, DS_NOTE_AVAILABLE } from "./notes";

const sym = (s: string) => nativeToScVal(s, { type: "symbol" });
const u32 = (n: number) => nativeToScVal(n, { type: "u32" });
const u256 = (v: bigint) => nativeToScVal(v, { type: "u256" });
const i128 = (v: bigint) => nativeToScVal(v, { type: "i128" });
const mapOf = (entries: [string, xdr.ScVal][]) =>
  xdr.ScVal.scvMap(entries.map(([k, v]) => new xdr.ScMapEntry({ key: sym(k), val: v })));

// Fold a path back to a root using the leaf-index path bits (the circuit's Merkle check).
function foldPath(leaf: bigint, leafIndex: number, path: bigint[]): bigint {
  let cur = leaf;
  for (let d = 0; d < path.length; d++) {
    cur = ((leafIndex >> d) & 1) === 0 ? compress(cur, path[d]) : compress(path[d], cur);
  }
  return cur;
}

describe("buildMerklePath", () => {
  it("single AVAILABLE leaf at index 0 reaches the circom MerkleProof(16) root", () => {
    const leaf = noteCommitment(
      DS_NOTE_AVAILABLE, amountToField(2_000_000_000_000_000_000n), 2n, 1n, 0n,
    );
    const { root, pathElements } = buildMerklePath([leaf], 0);
    expect(pathElements).toHaveLength(TREE_DEPTH);
    expect(pathElements).toEqual(ZERO_LEVELS.slice(0, TREE_DEPTH));
    expect(root).toBe(0x150d7055c4e2e796814f44c6ef83250670f7d8f0efc2012c683b5cee383bf33cn);
  });

  it("every leaf's path folds back to the tree root", () => {
    const leaves = [111n, 222n, 333n, 444n, 555n, 666n, 777n]; // odd count → exercises zero-padding
    const root = computeRoot(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const { pathElements } = buildMerklePath(leaves, i);
      expect(foldPath(leaves[i], i, pathElements)).toBe(root);
    }
  });

  it("empty tree root is ZERO_LEVELS[16]", () => {
    expect(computeRoot([])).toBe(ZERO_LEVELS[TREE_DEPTH]);
  });

  it("rejects a leafIndex beyond the known leaves", () => {
    expect(() => buildMerklePath([1n, 2n], 5)).toThrow(/beyond/);
  });
});

describe("indexLeaves", () => {
  it("packs contiguous events into a dense array", () => {
    expect(indexLeaves([
      { index: 2, commitment: 30n }, { index: 0, commitment: 10n }, { index: 1, commitment: 20n },
    ])).toEqual([10n, 20n, 30n]);
  });

  it("throws on a hole (unindexable seize change-leaf)", () => {
    expect(() => indexLeaves([{ index: 0, commitment: 10n }, { index: 2, commitment: 30n }]))
      .toThrow(/incomplete/);
  });

  it("throws on a conflicting commitment at one index", () => {
    expect(() => indexLeaves([{ index: 0, commitment: 10n }, { index: 0, commitment: 99n }]))
      .toThrow(/conflicting/);
  });

  it("tolerates a duplicate identical event", () => {
    expect(indexLeaves([{ index: 0, commitment: 10n }, { index: 0, commitment: 10n }])).toEqual([10n]);
  });
});

describe("pathForCommitment", () => {
  it("finds a commitment's path and it folds to the root", () => {
    const events = [
      { index: 0, commitment: 10n }, { index: 1, commitment: 20n }, { index: 2, commitment: 30n },
    ];
    const { leafIndex, pathElements, root } = pathForCommitment(events, 20n);
    expect(leafIndex).toBe(1);
    expect(foldPath(20n, 1, pathElements)).toBe(root);
    expect(root).toBe(computeRoot([10n, 20n, 30n]));
  });

  it("throws when the commitment is absent", () => {
    expect(() => pathForCommitment([{ index: 0, commitment: 10n }], 999n)).toThrow(/not found/);
  });
});

describe("decodeLeafEvent", () => {
  const C = 0x01c209ef09acd7a181e181b9f7e89cb7d50f20aed95345d061c9929a8398e10dn;

  it("decodes Deposit (SDK-27 shape: name topic + index topic + map{commitment})", () => {
    const data = mapOf([["commitment", u256(C)]]);
    expect(decodeLeafEvent([sym("Deposit"), u32(7)], data)).toEqual({ index: 7, commitment: C });
  });

  it("also decodes a bare-U256 data body (defensive fallback)", () => {
    expect(decodeLeafEvent([sym("Deposit"), u32(7)], u256(C))).toEqual({ index: 7, commitment: C });
  });

  it("decodes AttestLock (index topic + map with amount+commitment)", () => {
    const data = mapOf([["amount", i128(10_000_000_000_000_000n)], ["commitment", u256(C)]]);
    expect(decodeLeafEvent([sym("AttestLock"), u32(5)], data)).toEqual({ index: 5, commitment: C });
  });

  it("decodes Spent (nullifier topic ignored; index+commitment from map)", () => {
    const data = mapOf([["commitment", u256(C)], ["index", u32(9)]]);
    expect(decodeLeafEvent([sym("Spent"), u256(0xdeadbeefn)], data)).toEqual({ index: 9, commitment: C });
  });

  it("returns null for a non-leaf event", () => {
    expect(decodeLeafEvent([sym("Other")], xdr.ScVal.scvVoid())).toBeNull();
  });

  it("rejects a structurally-leaf-like event whose name is unknown", () => {
    const data = mapOf([["commitment", u256(C)]]);
    expect(decodeLeafEvent([sym("SomethingElse"), u32(1)], data)).toBeNull();
  });
});
