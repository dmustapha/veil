#!/usr/bin/env bash
# Vendor the compiled Veil circuits into web/public so the browser prover can fetch them.
# Source of truth is ../circom (Phase 2 compile + Phase 3 single-party ceremony). Re-run after any
# circuit change or re-ceremony. The .zkey is a PUBLIC proving key (not a secret) — safe to serve.
set -e
SRC="$(cd "$(dirname "$0")/../../circom" && pwd)"
PUB="$(cd "$(dirname "$0")/../public/circuits" && pwd)"

vendor() { # <circuit>: copy the Test(16)-wrapper wasm + ceremony zkey + vkey into public/circuits/<c>
  local c="$1"
  local dst="$PUB/$c"
  mkdir -p "$dst"
  cp "$SRC/${c}_test_js/${c}_test.wasm" "$dst/$c.wasm"    # witness calculator for <Circuit>(16)
  cp "$SRC/$c.zkey"                     "$dst/$c.zkey"    # groth16 proving key (post-ceremony)
  cp "$SRC/keys/$c.vk.json"             "$dst/$c.vk.json" # verification key (offline verify)
  echo "vendored $c.{wasm,zkey,vk.json} -> $dst"
}

# Only vendor circuits changed in the reverse-leg build. borrow + deposit_from_eth are ALREADY
# vendored and their proving keys are matched pairs with the LIVE deployed verifiers — re-vendoring
# them from disk risks clobbering the working artifacts with a stale/re-ceremonied zkey. Do NOT add
# them back without re-confirming disk == deployment.
vendor lock
vendor release_repaid
