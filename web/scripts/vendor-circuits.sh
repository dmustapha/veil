#!/usr/bin/env bash
# Vendor the compiled Veil borrow circuit into web/public so the browser prover can fetch them.
# Source of truth is ../circom (Phase 2 compile + Phase 3 single-party ceremony). Re-run after any
# circuit change or re-ceremony. The .zkey is a PUBLIC proving key (not a secret) — safe to serve.
set -e
SRC="$(cd "$(dirname "$0")/../../circom" && pwd)"
DST="$(cd "$(dirname "$0")/../public/circuits/borrow" && pwd)"
cp "$SRC/borrow_test_js/borrow_test.wasm" "$DST/borrow.wasm"   # witness calculator for Borrow(16)
cp "$SRC/borrow.zkey"                     "$DST/borrow.zkey"   # groth16 proving key (post-ceremony)
cp "$SRC/keys/borrow.vk.json"             "$DST/borrow.vk.json" # verification key (offline verify)
echo "vendored borrow.{wasm,zkey,vk.json} -> $DST"
