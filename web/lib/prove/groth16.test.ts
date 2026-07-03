// Offline guards for the proof transcoders. The coordinate swap in G2 is otherwise only exercised by
// the live on-chain verify (a wrong swap → verifier returns false), so these lock the byte layout
// against regressions without a network round-trip.
import { describe, expect, it } from "vitest";
import { fieldBytes, toEvmProof, toSorobanProof, type SnarkProof } from "./groth16";

// A structurally-valid snarkjs proof with distinguishable coordinates (not on-curve — layout only).
const PROOF: SnarkProof = {
  pi_a: ["1", "2", "1"],
  pi_b: [["3", "4"], ["5", "6"], ["1", "0"]], // [[x.c0, x.c1], [y.c0, y.c1], ...]
  pi_c: ["7", "8", "1"],
  protocol: "groth16",
  curve: "bn128",
};

describe("toEvmProof", () => {
  it("swaps Fp2 coordinates to imaginary-first (c1 before c0)", () => {
    const { pA, pB, pC } = toEvmProof(PROOF);
    expect(pA).toEqual([1n, 2n]);
    expect(pB).toEqual([[4n, 3n], [6n, 5n]]); // each pair reversed
    expect(pC).toEqual([7n, 8n]);
  });
});

describe("toSorobanProof", () => {
  it("lays out A(64) ‖ B(128) ‖ C(64) with G2 imaginary-first", () => {
    const sp = toSorobanProof(PROOF);
    expect(sp.a).toHaveLength(64);
    expect(sp.b).toHaveLength(128);
    expect(sp.c).toHaveLength(64);
    expect(sp.bytes).toHaveLength(256);
    // B = x.c1 ‖ x.c0 ‖ y.c1 ‖ y.c0 → the first 32-byte word is x.c1 = 4.
    expect(sp.b.slice(0, 32)).toEqual(fieldBytes(4n));
    expect(sp.b.slice(32, 64)).toEqual(fieldBytes(3n));
    expect(sp.b.slice(64, 96)).toEqual(fieldBytes(6n));
    expect(sp.b.slice(96, 128)).toEqual(fieldBytes(5n));
  });
});

describe("fieldBytes", () => {
  it("is 32-byte big-endian and rejects oversized values", () => {
    expect(fieldBytes(1n)[31]).toBe(1);
    expect(fieldBytes(1n).slice(0, 31).every((b) => b === 0)).toBe(true);
    expect(() => fieldBytes(1n << 256n)).toThrow();
    expect(() => fieldBytes(-1n)).toThrow();
  });
});
