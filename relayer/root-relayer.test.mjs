// Item 5 — Relayer A unit tests (pure logic only; no live chain).
// Run: node --test relayer/root-relayer.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseBytes32, normalizeRoot, shouldPost } from "./root-relayer.mjs";

const R = "e7a935fd4370e33243b4b66fe104dbee170db86603e4a0845d6bb491d0187a44";
const ZERO = "0".repeat(64);

test("parseBytes32 extracts a clean cast bytes32 line", () => {
  assert.equal(parseBytes32("0x" + R), "0x" + R);
});

test("parseBytes32 finds the root amid log noise (last match wins)", () => {
  const noisy = `simulating tx...\nsome log\n0x${R}\n`;
  assert.equal(parseBytes32(noisy), "0x" + R);
});

test("parseBytes32 lowercases", () => {
  assert.equal(parseBytes32("0x" + R.toUpperCase()), "0x" + R);
});

test("parseBytes32 returns null when no bytes32 present", () => {
  assert.equal(parseBytes32("no hash here\nerror: revert"), null);
});

test("normalizeRoot strips 0x and lowercases to bare 64-hex", () => {
  assert.equal(normalizeRoot("0x" + R.toUpperCase()), R);
  assert.equal(normalizeRoot(R), R);
});

test("normalizeRoot throws on malformed input", () => {
  assert.throws(() => normalizeRoot("0xdeadbeef"));     // too short
  assert.throws(() => normalizeRoot("z".repeat(64)));   // non-hex
  assert.throws(() => normalizeRoot(""));
});

test("shouldPost: true for a fresh nonzero root (no prior)", () => {
  assert.equal(shouldPost("0x" + R, null), true);
});

test("shouldPost: false when current equals last posted (dedup, case/0x-insensitive)", () => {
  assert.equal(shouldPost("0x" + R, R.toUpperCase()), false);
});

test("shouldPost: false for the all-zero root (uninitialized read guard)", () => {
  assert.equal(shouldPost("0x" + ZERO, null), false);
});

test("shouldPost: true when the root changed since last post", () => {
  const other = "a".repeat(64);
  assert.equal(shouldPost("0x" + R, other), true);
});
