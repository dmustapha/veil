// Item 7 — Relayer B unit tests (pure logic only; no live chain).
// Run: node --test relayer/soroban-root-relayer.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseBool, repaidRoot, ethKnowsRoot, postSorobanRoot } from "./soroban-root-relayer.mjs";

test("parseBool reads a cast bool defensively", () => {
  assert.equal(parseBool("true"), true);
  assert.equal(parseBool("false"), false);
  assert.equal(parseBool("simulating...\ntrue\n"), true);
  assert.equal(parseBool("error: reverted"), false);
});

test("Relayer B exposes its chain I/O surface", () => {
  for (const fn of [repaidRoot, ethKnowsRoot, postSorobanRoot]) {
    assert.equal(typeof fn, "function");
  }
});
