// Item 10 — anonymity seeder unit tests (pure argv/parse logic only; no live chain, no secrets).
// Run: node --test relayer/anonymity-seeder.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  loadDecoys,
  totalAmount,
  decoyEncNote,
  mintArgs,
  approveArgs,
  depositArgs,
} from "./anonymity-seeder.mjs";

const C0 = "0x" + "aa".repeat(32);
const C1 = "0x" + "bb".repeat(32);
const SAMPLE = {
  decoys: [
    { index: 0, amount: "50000000000000000", blinding: "0x" + "11".repeat(32), spend_pk: "0x" + "22".repeat(32), nk: "0x" + "33".repeat(32), commitment: C0 },
    { index: 1, amount: "250000000000000000", blinding: "0x" + "44".repeat(32), spend_pk: "0x" + "55".repeat(32), nk: "0x" + "66".repeat(32), commitment: C1 },
  ],
};

test("loadDecoys parses + normalizes (amount->BigInt, spend_pk->spendPk)", () => {
  const d = loadDecoys(JSON.stringify(SAMPLE));
  assert.equal(d.length, 2);
  assert.equal(d[0].amount, 50000000000000000n);
  assert.equal(d[0].spendPk, "0x" + "22".repeat(32));
  assert.equal(d[1].index, 1);
});

test("loadDecoys rejects an empty / malformed set", () => {
  assert.throws(() => loadDecoys(JSON.stringify({ decoys: [] })), /no decoys/);
  assert.throws(() => loadDecoys(JSON.stringify({ decoys: [{ amount: "1" }] })), /missing field/);
});

test("totalAmount sums decoy amounts as BigInt", () => {
  assert.equal(totalAmount(loadDecoys(SAMPLE)), 300000000000000000n);
});

test("decoyEncNote is the (public) commitment blob, non-empty", () => {
  const [d0] = loadDecoys(SAMPLE);
  assert.equal(decoyEncNote(d0), C0);
});

test("mintArgs / approveArgs build correct cast send argv", () => {
  assert.deepEqual(
    mintArgs("0xW", "0xDEP", 300n, "RPC", "KEY"),
    ["send", "0xW", "mint(address,uint256)", "0xDEP", "300", "--rpc-url", "RPC", "--private-key", "KEY"],
  );
  assert.deepEqual(
    approveArgs("0xW", "0xPOOL", 300n, "RPC", "KEY"),
    ["send", "0xW", "approve(address,uint256)", "0xPOOL", "300", "--rpc-url", "RPC", "--private-key", "KEY"],
  );
});

test("depositArgs matches VeilPool.deposit(uint128,bytes32,bytes32,bytes) with the note opening", () => {
  const [d0] = loadDecoys(SAMPLE);
  assert.deepEqual(
    depositArgs("0xPOOL", d0, decoyEncNote(d0), "RPC", "KEY"),
    [
      "send", "0xPOOL", "deposit(uint128,bytes32,bytes32,bytes)",
      "50000000000000000", "0x" + "11".repeat(32), "0x" + "22".repeat(32), C0,
      "--rpc-url", "RPC", "--private-key", "KEY",
    ],
  );
});

test("depositArgs never includes nk (the spend key stays in the artifact only)", () => {
  const [d0] = loadDecoys(SAMPLE);
  const argv = depositArgs("0xPOOL", d0, decoyEncNote(d0), "RPC", "KEY");
  assert.ok(!argv.includes("0x" + "33".repeat(32)), "nk must not appear in deposit calldata");
});
