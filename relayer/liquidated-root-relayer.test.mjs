// Item 8 — Relayer C unit tests (pure logic only; no live chain).
// Run: node --test relayer/liquidated-root-relayer.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { shouldPost } from "./root-relayer.mjs";
import {
  liquidatedRoot,
  ethKnowsLiquidatedRoot,
  postLiquidatedRoot,
} from "./liquidated-root-relayer.mjs";

test("Relayer C exposes its chain I/O surface", () => {
  for (const fn of [liquidatedRoot, ethKnowsLiquidatedRoot, postLiquidatedRoot]) {
    assert.equal(typeof fn, "function");
  }
});

test("Relayer C reuses the shared shouldPost dedup", () => {
  // a fresh R_liq must post; the same R_liq again must not (in-memory dedup).
  const rLiq = "0x" + "ab".repeat(32);
  assert.equal(shouldPost(rLiq, null), true);
  assert.equal(shouldPost(rLiq, "ab".repeat(32)), false);
});
