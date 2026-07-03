// Golden vectors locking the browser Poseidon2 to circom + the Soroban host. Expected values are
// the circom-verified constants from contracts/veil-pool/src/lib.rs (gate_zero_test / gate_t3_test).
import { describe, expect, it } from "vitest";
import { compress, hash2, permutation, P } from "./poseidon2";

describe("poseidon2 primitives", () => {
  it("compress(1,2) matches circom PoseidonCompress", () => {
    expect(compress(1n, 2n)).toBe(
      0x0e90c132311e864e0c8bca37976f28579a2dd9436bbc11326e21ec7c00cea5b3n,
    );
  });

  it("hash2(1,2,3) matches circom Poseidon2(2)", () => {
    expect(hash2(1n, 2n, 3n)).toBe(
      0x0a799a621cac2cea1ec6fdbcd5dc92cadd31c210c912aaca009aca578d210768n,
    );
  });

  it("hash2 default domain separation is 0", () => {
    expect(hash2(1n, 2n)).toBe(hash2(1n, 2n, 0n));
  });

  it("permutation output stays in the field", () => {
    for (const s of permutation([123n, 456n, 789n])) {
      expect(s).toBeGreaterThanOrEqual(0n);
      expect(s).toBeLessThan(P);
    }
  });

  it("rejects unsupported widths", () => {
    expect(() => permutation([1n, 2n, 3n, 4n])).toThrow(/unsupported width/);
  });
});
