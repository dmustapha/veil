// Unit tests for the eth-lock relayer's pure decoders (no network, no secrets).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeLockedLog, decodeLockedLogs, I128_MAX } from "./eth-lock-relayer.mjs";

// Real fixture values: C = the AVAILABLE note commitment, amount = 2e18 (0x1bc16d674ec80000).
const C = 0x01c209ef09acd7a181e181b9f7e89cb7d50f20aed95345d061c9929a8398e10dn;
const AMOUNT = 2_000_000_000_000_000_000n;
const OWNER = "0x00000000000000000000000000000000000a11ce";
const SIG_TOPIC = "0x" + "ab".repeat(32); // event signature topic0 (unused by the decoder)

function lockedLog() {
  return {
    topics: [
      SIG_TOPIC,
      "0x01c209ef09acd7a181e181b9f7e89cb7d50f20aed95345d061c9929a8398e10d", // commitment (indexed)
      "0x000000000000000000000000" + OWNER.slice(2), // owner (indexed, right-aligned)
    ],
    data: "0x0000000000000000000000000000000000000000000000001bc16d674ec80000", // amount = 2e18
  };
}

test("decodeLockedLog extracts commitment, amount, owner", () => {
  const d = decodeLockedLog(lockedLog());
  assert.equal(d.commitment, C);
  assert.equal(d.amount, AMOUNT);
  assert.equal(d.owner.toLowerCase(), OWNER.toLowerCase());
});

test("decodeLockedLog rejects a log with too few topics", () => {
  assert.throws(() => decodeLockedLog({ topics: ["0x00"], data: "0x01" }), /3 topics/);
});

test("decodeLockedLog rejects a non-positive amount", () => {
  const bad = lockedLog();
  bad.data = "0x" + "0".repeat(64);
  assert.throws(() => decodeLockedLog(bad), /must be positive/);
});

test("decodeLockedLog rejects an amount above i128::MAX (audit L-01)", () => {
  const bad = lockedLog();
  bad.data = "0x" + ((1n << 127n)).toString(16).padStart(64, "0"); // 2^127 = i128::MAX + 1
  assert.throws(() => decodeLockedLog(bad), /exceeds i128::MAX/);
});

test("decodeLockedLog accepts amount == i128::MAX (boundary)", () => {
  const ok = lockedLog();
  ok.data = "0x" + I128_MAX.toString(16).padStart(64, "0");
  assert.equal(decodeLockedLog(ok).amount, I128_MAX);
});

test("decodeLockedLogs parses a cast --json array (tolerating leading noise)", () => {
  const stdout = "some cast log line\n" + JSON.stringify([lockedLog(), lockedLog()]);
  const ds = decodeLockedLogs(stdout);
  assert.equal(ds.length, 2);
  assert.equal(ds[0].commitment, C);
  assert.equal(ds[1].amount, AMOUNT);
});

test("decodeLockedLogs returns [] when there are no logs", () => {
  assert.deepEqual(decodeLockedLogs("no json here"), []);
});
