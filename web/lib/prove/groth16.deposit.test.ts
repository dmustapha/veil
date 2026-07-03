// deposit_from_eth client prover: proves the opening that binds a public note commitment C to a
// public amount, verifies it offline against the vendored verification key, and confirms the EVM
// calldata shape. The on-chain (live Sepolia verifier) check lives in scripts/verify-deposit-prover.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { depositPubSignals, proveDepositFromEth, toEvmProof, type BorrowProof } from "./groth16";
import { amountToField, noteCommitment, DS_NOTE_AVAILABLE } from "./notes";

const DIR = resolve(import.meta.dirname, "../../public/circuits/deposit_from_eth");
const ASSETS = {
  wasm: resolve(DIR, "deposit_from_eth.wasm"),
  zkey: resolve(DIR, "deposit_from_eth.zkey"),
};
const VK = JSON.parse(readFileSync(resolve(DIR, "deposit_from_eth.vk.json"), "utf8"));

const AMOUNT = 2_000_000_000_000_000_000n; // 2e18
// C is derived by the SAME JS primitive the circuit encodes — the binding under test.
const C = noteCommitment(DS_NOTE_AVAILABLE, amountToField(AMOUNT), 2n, 1n, 0n);

describe("deposit_from_eth client prover", () => {
  let proof: BorrowProof;

  beforeAll(async () => {
    proof = await proveDepositFromEth(
      { amount: AMOUNT.toString(), C: C.toString(), spendPk: "2", blinding: "1" },
      ASSETS,
    );
  }, 60_000);

  it("the JS noteCommitment equals the circuit's fixed C (U1 ↔ circuit binding)", () => {
    expect(C).toBe(795149739313561338848873385126253479486454485737362998628268494954929119501n);
  });

  it("proof verifies offline against the vendored vk", async () => {
    const snarkjs = await import("snarkjs");
    expect(await snarkjs.groth16.verify(VK, proof.publicSignals, proof.proof)).toBe(true);
  });

  it("public signals are [amount, C]", () => {
    expect(depositPubSignals(proof.publicSignals)).toEqual([AMOUNT, C]);
  });

  it("toEvmProof has the verifyProof(pA[2], pB[2][2], pC[2]) shape", () => {
    const evm = toEvmProof(proof.proof);
    expect(evm.pA).toHaveLength(2);
    expect(evm.pB).toHaveLength(2);
    expect(evm.pB[0]).toHaveLength(2);
    expect(evm.pB[1]).toHaveLength(2);
    expect(evm.pC).toHaveLength(2);
    for (const v of [...evm.pA, ...evm.pB.flat(), ...evm.pC]) expect(typeof v).toBe("bigint");
  });

  it("rejects tampered public signals offline", async () => {
    const snarkjs = await import("snarkjs");
    const tampered = [...proof.publicSignals];
    tampered[0] = (BigInt(tampered[0]) + 1n).toString(); // claim a larger amount than the note
    expect(await snarkjs.groth16.verify(VK, tampered, proof.proof)).toBe(false);
  });
});
