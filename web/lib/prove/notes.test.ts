// Cross-impl golden vectors for the note-commitment / nullifier / domain-hash chain. Every expected
// value is pinned to circom and asserted on-chain in contracts/veil-pool/src/lib.rs.
import { describe, expect, it } from "vitest";
import {
  DS_NOTE_AVAILABLE, DS_NOTE_LOCKED,
  amountToField, noteCommitment, nullifier, spendPkFromNk,
  positionId, lockHandle, repaidLeaf, liquidatedLeaf,
} from "./notes";

describe("note commitment", () => {
  const amount = amountToField(2_000_000_000_000_000_000n); // 2e18

  it("LOCKED (ds=0x11, amount=2e18, spendPk=2, blinding=1, aux=3)", () => {
    expect(noteCommitment(DS_NOTE_LOCKED, amount, 2n, 1n, 3n)).toBe(
      0x1c7441b2dd964a0b1f0f22dc590351ced0082c6edf10f7cbe2871d0c29112f9an,
    );
  });

  it("AVAILABLE (ds=0x10, amount=2e18, spendPk=2, blinding=1, aux=0)", () => {
    expect(noteCommitment(DS_NOTE_AVAILABLE, amount, 2n, 1n, 0n)).toBe(
      0x01c209ef09acd7a181e181b9f7e89cb7d50f20aed95345d061c9929a8398e10dn,
    );
  });

  it("domain-separates AVAILABLE from LOCKED", () => {
    expect(noteCommitment(DS_NOTE_AVAILABLE, 1000n, 7n, 9n, 0n)).not.toBe(
      noteCommitment(DS_NOTE_LOCKED, 1000n, 7n, 9n, 0n),
    );
  });
});

describe("nullifier", () => {
  it("nullifier(nk=5, C=7, leafIndex=3) matches circom Nullifier", () => {
    expect(nullifier(5n, 7n, 3n)).toBe(
      0x0d0e7dc8c792f33c6cee9f8bfcd95e5ccaed253ca11dbf31aa7af6b5d7909013n,
    );
  });
});

describe("domain hashes", () => {
  it("spendPkFromNk(5) matches circom DomainHash1(5, 0x34)", () => {
    expect(spendPkFromNk(5n)).toBe(
      0x068b44d9b05857a1a8427e25068686a001ed9b8da50fe91e97fd702d599ba0b2n,
    );
  });

  it("spendPkFromNk(5) matches the e2e SPEND_PK decimal", () => {
    expect(spendPkFromNk(5n)).toBe(
      2959944021135107534354482395319063899239552202030878317183496805275873812658n,
    );
  });

  it("lockHandle(3) matches circom DomainHash1(3, 0x31)", () => {
    expect(lockHandle(3n)).toBe(
      0x0defe1575cc99dd389e73b0c93e887b18eb6e05f095e428de35f9726d9ce25ean,
    );
  });

  it("positionId(4) matches circom DomainHash1(4, 0x30)", () => {
    expect(positionId(4n)).toBe(
      0x0f34e406a3fc1398015e5f23ce5e002197da689afa2aa9293c3e4ed22e82e066n,
    );
  });

  it("repaidLeaf(lockHandle(3)) matches circom DomainHash1(lh, 0x32)", () => {
    expect(repaidLeaf(lockHandle(3n))).toBe(
      0x232ce752794ce14f434d9c8cc15b46ee04875fa78d541c09f49171f4253a1d32n,
    );
  });

  it("liquidatedLeaf(lockHandle(3)) matches circom DomainHash1(lh, 0x33)", () => {
    expect(liquidatedLeaf(lockHandle(3n))).toBe(
      0x2e72222bf6fa84ceb1a131012c7508cf9292bcb919cf3eb590b726486cb9ebdcn,
    );
  });
});
